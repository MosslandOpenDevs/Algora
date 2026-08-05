#!/usr/bin/env bash
#
# Algora pull-based auto-deploy.
#
# Runs ON the application server (the box PM2 lives on) and brings the checkout
# up to origin/main. Idempotent: when the last successful deploy already equals
# the remote tip it does nothing and exits 0, so it is safe to run from PM2's
# cron every few minutes.
#
# Why pull-based instead of a push from CI: the app server has no public inbound
# route (it is reachable over Tailscale only) and the repo is public, so a
# self-hosted runner would be a footgun. Fetching outbound needs no deploy key,
# no open port, and no GitHub configuration at all. Same rationale and structure
# as agentic-orchestrator's scripts/deploy.sh, adapted for a pnpm monorepo.
#
# Restarting algora-api kills any in-flight agora deliberation session; that is
# accepted (sessions are periodic and resume on the next scheduler tick).
#
# Design notes (each learned the hard way, here or in the sibling pollers):
#   - The deploy baseline is the last SUCCESSFUL deploy, not HEAD. The
#     `git reset --hard` below moves HEAD before the build and health check
#     have proven the commit, so a SIGKILL/OOM/reboot mid-deploy used to leave
#     HEAD at the new tip with the old (or half-written) build on disk -- and
#     the next tick would read "up to date" and never retry. The last-good SHA
#     now lives in the state dir (inside .git/, where no reset, build or clean
#     can sweep it) and advances only after the health check passes, so an
#     interrupted or failed deploy is retried on a later tick.
#   - `pnpm build` (turbo) writes straight into the live apps/web/.next and
#     apps/api/dist -- and into packages/*/dist, which the running API resolves
#     through node_modules symlinks. A separate build directory + swap is not
#     practical here (next/tsc pin their output dirs in runtime-shared config),
#     so the live outputs are snapshotted before each build and restored when
#     the build fails: a broken commit can no longer strand half-written
#     outputs under the running processes, and rollback gets a rebuild-free
#     fast path from the same snapshot.
#   - A commit that failed to deploy is retried with exponential backoff
#     (5m, 10m, 20m, ... capped at 60m) instead of burning a full
#     build + double-restart + webhook cycle every 5 minutes forever. A new
#     commit on the remote resets the backoff; repeated-failure alerts are
#     deduplicated per SHA.
#   - HEAD must be an ancestor of the remote tip. Commits made by hand on the
#     server would be silently destroyed by `reset --hard`, so they stop the
#     deploy instead (push or drop them, or use --force).
#   - The whole flow runs inside main() so that when a deploy updates this
#     very script mid-run, bash keeps executing the already-parsed code
#     instead of a half-read mix of old and new file contents.
#
# Usage:
#   scripts/deploy.sh              # deploy if the remote moved (normal cron use)
#   scripts/deploy.sh --check      # report what would happen, change nothing
#   scripts/deploy.sh --force      # ignore the CI gate, the dirty-tree and
#                                  # local-commit guards, and the failure backoff
#
# Configuration (env, all optional):
#   DEPLOY_BRANCH          branch to track                     (default: main)
#   DEPLOY_REMOTE          git remote                          (default: origin)
#   DEPLOY_REQUIRE_CI      1 = only deploy CI-green commits    (default: 1)
#                          Fail-closed: failure, no checks reported, and an
#                          unreachable GitHub API all hold the deploy. Needs
#                          GITHUB_TOKEN on a box whose unauthenticated GitHub
#                          quota is consumed by the Algora collectors —
#                          without it the status reads unavailable and nothing
#                          ships. Use --force for a commit the gate will not
#                          pass (e.g. one predating .github/workflows/ci.yml).
#                          NOTE: pm2 stores env at registration, so changing
#                          this default does not reach a poller already
#                          registered with DEPLOY_REQUIRE_CI=0 — re-register it.
#   DEPLOY_GITHUB_REPO     owner/name used for the CI query
#   DEPLOY_CI_TIMEOUT_MIN  minutes a pending CI may hold deploys before the
#                          gate assumes a stuck check-run, warns and proceeds
#                          (default: 30)
#   DEPLOY_API_URL         backend health URL                  (:3201)
#   DEPLOY_WEB_URL         frontend health URL                 (:3200)
#   DEPLOY_HEALTH_RETRIES  health poll attempts                (default: 20)
#   DEPLOY_HEALTH_INTERVAL seconds between attempts            (default: 3)
#   DEPLOY_BACKOFF_BASE_MIN  first retry delay for a failed SHA (default: 5)
#   DEPLOY_BACKOFF_MAX_MIN   retry delay cap                    (default: 60)
#   DEPLOY_LOCK_STALE_MIN  lock age before a dead owner is assumed when the
#                          owner pid cannot be checked           (default: 90)
#   DEPLOY_ALERT_WEBHOOK   Slack/Discord webhook for failures  (default: none)
#   DEPLOY_VERBOSE         1 = also log no-op ticks            (default: 0)
#   DEPLOY_STATE_DIR       last-good SHA / backoff / CI-pending state
#                          (default: <git dir>/algora-deploy)
#   DEPLOY_BACKUP_DIR      pre-build output snapshot (default: .deploy-backup/
#                          at the repo root; untracked and gitignored)
#   PM2_BIN / PNPM_BIN / GITHUB_TOKEN
#
# Data safety: this script only ever runs `git reset --hard`, which leaves
# untracked files alone. It must NEVER run `git clean` — .env,
# apps/api/data/algora.db and apps/api/data/backup/ live on the server and are
# untracked (as are the state dir and .deploy-backup/).

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/.." && pwd)
cd "${REPO_ROOT}"

DEPLOY_BRANCH=${DEPLOY_BRANCH:-main}
DEPLOY_REMOTE=${DEPLOY_REMOTE:-origin}
DEPLOY_REQUIRE_CI=${DEPLOY_REQUIRE_CI:-1}
DEPLOY_GITHUB_REPO=${DEPLOY_GITHUB_REPO:-MosslandOpenDevs/Algora}
DEPLOY_CI_TIMEOUT_MIN=${DEPLOY_CI_TIMEOUT_MIN:-30}
DEPLOY_API_URL=${DEPLOY_API_URL:-http://127.0.0.1:3201}
DEPLOY_WEB_URL=${DEPLOY_WEB_URL:-http://127.0.0.1:3200}
DEPLOY_HEALTH_RETRIES=${DEPLOY_HEALTH_RETRIES:-20}
DEPLOY_HEALTH_INTERVAL=${DEPLOY_HEALTH_INTERVAL:-3}
DEPLOY_BACKOFF_BASE_MIN=${DEPLOY_BACKOFF_BASE_MIN:-5}
DEPLOY_BACKOFF_MAX_MIN=${DEPLOY_BACKOFF_MAX_MIN:-60}
DEPLOY_ALERT_WEBHOOK=${DEPLOY_ALERT_WEBHOOK:-}
DEPLOY_VERBOSE=${DEPLOY_VERBOSE:-0}
DEPLOY_LOG=${DEPLOY_LOG:-${REPO_ROOT}/logs/deploy.log}
DEPLOY_LOCK=${DEPLOY_LOCK:-${REPO_ROOT}/logs/.deploy.lock}
DEPLOY_LOCK_STALE_MIN=${DEPLOY_LOCK_STALE_MIN:-90}
# State lives inside .git/ (like git's own refs): `git reset --hard` and
# `pnpm build` can rewrite anything in the worktree, and logs/ is subject to
# rotation -- .git/ is the one place a deploy can never sweep by accident.
GIT_DIR_ABS=$(git rev-parse --absolute-git-dir 2>/dev/null || echo "${REPO_ROOT}/.git")
DEPLOY_STATE_DIR=${DEPLOY_STATE_DIR:-${GIT_DIR_ABS}/algora-deploy}
DEPLOY_BACKUP_DIR=${DEPLOY_BACKUP_DIR:-${REPO_ROOT}/.deploy-backup}

PM2_BIN=${PM2_BIN:-pm2}
PNPM_BIN=${PNPM_BIN:-pnpm}

# pm2 flattens the managed process's own config into its child environment, so
# under the algora-deploy cron this shell literally has cron_restart,
# autorestart etc. as env vars. Scrub them so no pm2 invocation from this
# script can ever merge them into a target app's stored config (the 2026-08-05
# `--update-env` incident class — see restart_apps). Key list kept in
# sync with the sibling pollers' fix (agentic-orchestrator PR #2949).
unset -v cron_restart autorestart watch instances exec_mode \
  max_memory_restart node_args name namespace || true

# Cross-run state (all single-line files under DEPLOY_STATE_DIR):
#   deployed-sha  last commit that passed build + restart + health check
#   failure       "<sha> <attempts> <last-attempt-epoch>" for the backoff
#   ci-pending    "<sha> <first-seen-epoch>" for the stuck-check-run timeout
#   alert-key     key of the last webhook alert sent (spam dedup)
FORCE=0
CHECK_ONLY=0
DEPLOYED=""
HEAD_SHA=""
TARGET=""
SUBJECT=""
API_CHANGED=0
WEB_CHANGED=0
DEPS_CHANGED=0
ECOSYSTEM_CHANGED=0
FAILURE_COUNT=0
FAILURE_LAST=0
SNAPSHOT_OK=0
RESTART_ATTEMPTED=0
ROLLING_BACK=0

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "${line}"
  mkdir -p "$(dirname "${DEPLOY_LOG}")" 2>/dev/null || true
  echo "${line}" >>"${DEPLOY_LOG}" 2>/dev/null || true
}

json_string() {
  node -e 'console.log(JSON.stringify(process.argv[1]))' "$1" 2>/dev/null \
    || printf '"%s"' "$1"
}

# Only reaches the operator when a webhook is configured; never fatal itself.
alert() {
  [ -n "${DEPLOY_ALERT_WEBHOOK}" ] || return 0
  local text="$1"
  curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
    -d "$(printf '{"text":%s,"content":%s}' \
            "$(json_string "${text}")" "$(json_string "${text}")")" \
    "${DEPLOY_ALERT_WEBHOOK}" >/dev/null 2>&1 || true
}

# Dedup wrapper: one webhook message per key. A guard that trips every 5-minute
# tick (dirty tree, red CI, failed SHA in backoff) must page the operator once,
# not 288 times a day. Keys embed the blocking SHA, so a new commit re-arms the
# alert. CRITICAL paths call alert() directly and are never deduplicated.
alert_once() {
  local key="$1" text="$2" f="${DEPLOY_STATE_DIR}/alert-key"
  if [ "$(cat "${f}" 2>/dev/null || true)" = "${key}" ]; then
    return 0
  fi
  printf '%s\n' "${key}" > "${f}" 2>/dev/null || true
  alert "${text}"
}

# Tripwire for the config-bleed class of pm2 bug (2026-08-05 incident: the
# then-used `pm2 restart --update-env` merged this process's flattened config
# into algora-api, whose inherited `1-59/5 * * * *` cron_restart SIGKILLed it
# every 5 minutes for hours, undetected). The app processes must never carry a
# cron_restart or a disabled autorestart — only algora-deploy/db-backup
# legitimately do, and the name allowlist excludes them. Runs on every tick
# (a bleed from outside this script would otherwise sit until the next real
# deploy) and again right after our own restarts. Fails open — a broken check
# must never block a deploy — but loudly, so a wedged pm2/jlist is
# distinguishable from a clean pass.
check_config_bleed() {
  local out
  out=$("${PM2_BIN}" jlist 2>/dev/null | node -e '
    const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const bad = list.filter(p => ["algora-api", "algora-web"].includes(p.name)
      && p.pm2_env
      && (p.pm2_env.cron_restart
          || p.pm2_env.autorestart === false
          || p.pm2_env.autorestart === "false"));
    console.log(bad.length ? "BLEED " + bad.map(p => p.name).join(" ") : "OK");
  ' 2>/dev/null || true)
  case "${out}" in
    OK) ;;
    "BLEED "*)
      local leaked="${out#BLEED }"
      log "WARNING pm2 config bleed: cron_restart/autorestart poisoned on: ${leaked}"
      log "WARNING fix: pm2 delete <app> && pm2 start ecosystem.config.cjs --only <app> && pm2 save"
      alert "Algora: pm2 config bleed on ${leaked} -- restarts every 5 minutes (or stops reviving on crash) until re-registered: pm2 delete <app> && pm2 start ecosystem.config.cjs --only <app> && pm2 save"
      ;;
    *)
      log "WARN config-bleed tripwire could not run (pm2 jlist unparseable or node failed)"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Single-flight lock. The lock dir records its owner's pid, so a deploy killed
# without cleanup (SIGKILL, OOM, reboot) is reclaimed on the very next tick
# instead of wedging every tick for DEPLOY_LOCK_STALE_MIN. A lock whose owner
# is still alive is never reclaimed early -- a hung `pnpm build` plus a second
# concurrent build would compound the damage -- but is warned about past the
# stale age and force-reclaimed past 3x (pid reuse could otherwise pin the
# lock forever).
# ---------------------------------------------------------------------------
acquire_lock() {  # 0 = acquired, 1 = skip this tick (logged)
  mkdir -p "$(dirname "${DEPLOY_LOCK}")"
  if mkdir "${DEPLOY_LOCK}" 2>/dev/null; then
    printf '%s\n' "$$" > "${DEPLOY_LOCK}/pid" 2>/dev/null || true
    return 0
  fi
  local owner reclaim=0
  owner=$(cat "${DEPLOY_LOCK}/pid" 2>/dev/null || true)
  case "${owner}" in ''|*[!0-9]*) owner="" ;; esac
  if [ -n "${owner}" ] && ! kill -0 "${owner}" 2>/dev/null; then
    log "WARN lock owner pid ${owner} is dead -- reclaiming lock"
    reclaim=1
  elif [ -n "$(find "${DEPLOY_LOCK}" -maxdepth 0 -mmin "+$((DEPLOY_LOCK_STALE_MIN * 3))" 2>/dev/null)" ]; then
    log "WARN lock held for over $((DEPLOY_LOCK_STALE_MIN * 3))m (owner pid ${owner:-unknown}) -- assuming a leaked/reused pid and reclaiming"
    reclaim=1
  elif [ -z "${owner}" ] && [ -n "$(find "${DEPLOY_LOCK}" -maxdepth 0 -mmin "+${DEPLOY_LOCK_STALE_MIN}" 2>/dev/null)" ]; then
    # no pid recorded (pre-pid lock, or the pid write failed): age is the only signal
    log "WARN stale lock older than ${DEPLOY_LOCK_STALE_MIN}m with no owner pid -- reclaiming"
    reclaim=1
  elif [ -n "${owner}" ] && [ -n "$(find "${DEPLOY_LOCK}" -maxdepth 0 -mmin "+${DEPLOY_LOCK_STALE_MIN}" 2>/dev/null)" ]; then
    log "WARN deploy pid ${owner} has held the lock for over ${DEPLOY_LOCK_STALE_MIN}m -- likely hung; NOT starting a second deploy"
    alert_once "hung-deploy-${owner}" "Algora deploy pid ${owner} has been running for over ${DEPLOY_LOCK_STALE_MIN}m -- investigate (hung pnpm build?)"
    return 1
  else
    if [ "${DEPLOY_VERBOSE}" = "1" ]; then
      log "another deploy is running (pid ${owner:-unknown}) -- skipping"
    fi
    return 1
  fi
  if [ "${reclaim}" = "1" ]; then
    rm -rf "${DEPLOY_LOCK}"
    # mkdir is the arbiter of the reclaim race; the loser backs off
    if mkdir "${DEPLOY_LOCK}" 2>/dev/null; then
      printf '%s\n' "$$" > "${DEPLOY_LOCK}/pid" 2>/dev/null || true
      return 0
    fi
    log "could not reclaim lock; skipping"
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Last-good state + failure backoff
# ---------------------------------------------------------------------------
mark_deployed() {
  printf '%s\n' "$1" > "${DEPLOY_STATE_DIR}/deployed-sha" 2>/dev/null \
    || { log "ERROR could not write ${DEPLOY_STATE_DIR}/deployed-sha -- the retry guarantee is broken"; return 1; }
}

# Loads FAILURE_COUNT/FAILURE_LAST for TARGET; a failure recorded for any other
# SHA means the remote has moved on, so it is forgotten (backoff reset).
load_failure_state() {
  local f="${DEPLOY_STATE_DIR}/failure" sha="" count="" last=""
  FAILURE_COUNT=0
  FAILURE_LAST=0
  [ -f "${f}" ] || return 0
  read -r sha count last < "${f}" 2>/dev/null || true
  if [ "${sha}" != "${TARGET}" ]; then
    rm -f "${f}" 2>/dev/null || true
    return 0
  fi
  case "${count}" in ''|*[!0-9]*) count=0 ;; esac
  case "${last}" in ''|*[!0-9]*) last=0 ;; esac
  FAILURE_COUNT=${count}
  FAILURE_LAST=${last}
}

record_failure() {
  printf '%s %s %s\n' "${TARGET}" "$((FAILURE_COUNT + 1))" "$(date +%s)" \
    > "${DEPLOY_STATE_DIR}/failure" 2>/dev/null \
    || log "WARN could not write ${DEPLOY_STATE_DIR}/failure -- retry pacing lost (next tick retries immediately)"
}

clear_failure() {
  rm -f "${DEPLOY_STATE_DIR}/failure" 2>/dev/null || true
}

in_backoff() {  # 0 = still cooling down (logged), 1 = clear to (re)try
  [ "${FAILURE_COUNT}" -ge 1 ] || return 1
  local exp wait_min now remaining
  exp=${FAILURE_COUNT}
  if [ "${exp}" -gt 10 ]; then exp=10; fi   # cap the shift, not the retries
  wait_min=$((DEPLOY_BACKOFF_BASE_MIN * (1 << (exp - 1))))
  if [ "${wait_min}" -gt "${DEPLOY_BACKOFF_MAX_MIN}" ]; then
    wait_min=${DEPLOY_BACKOFF_MAX_MIN}
  fi
  now=$(date +%s)
  if [ $((now - FAILURE_LAST)) -lt $((wait_min * 60)) ]; then
    remaining=$(((FAILURE_LAST + wait_min * 60 - now + 59) / 60))
    log "backoff: ${TARGET:0:8} already failed ${FAILURE_COUNT}x -- next retry in ~${remaining}m"
    return 0
  fi
  log "backoff elapsed -- retrying ${TARGET:0:8} (attempt $((FAILURE_COUNT + 1)))"
  return 1
}

# ---------------------------------------------------------------------------
# CI gate: deploy only commits GitHub Actions has gone green on.
# ---------------------------------------------------------------------------
ci_conclusion() {
  local sha="$1" url auth
  # per_page=100 is the API max; the default page of 30 could hide a failing
  # run behind 30 green ones. One page at 100 keeps this dependency-free --
  # revisit with real pagination if the suite ever grows past that.
  url="https://api.github.com/repos/${DEPLOY_GITHUB_REPO}/commits/${sha}/check-runs?per_page=100"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    auth="Authorization: Bearer ${GITHUB_TOKEN}"
  else
    auth="X-No-Auth: 1"
  fi
  curl -fsS -m 20 -H 'Accept: application/vnd.github+json' -H "${auth}" "${url}" 2>/dev/null \
    | node -e '
let raw = "";
process.stdin.on("data", d => (raw += d));
process.stdin.on("end", () => {
  let runs;
  try { runs = JSON.parse(raw).check_runs || []; }
  catch { console.log("unknown"); return; }
  if (!runs.length) { console.log("none"); return; }
  const bad = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);
  if (runs.some(r => r.status !== "completed")) console.log("pending");
  else if (runs.some(r => bad.has(r.conclusion))) console.log("failure");
  else console.log("success");
});
' 2>/dev/null || echo "unknown"
}

ci_gate() {  # 0 = proceed, 1 = hold this tick (logged)
  local status pending_file="${DEPLOY_STATE_DIR}/ci-pending" rec_sha="" first="" now elapsed
  status=$(ci_conclusion "${TARGET}")
  case "${status}" in
    success)
      log "CI: green"
      rm -f "${pending_file}" 2>/dev/null || true
      ;;
    none)
      # Fail closed. "No checks" is indistinguishable from "the workflow never
      # ran", which is exactly the state an unverified commit is in — treating it
      # as green made DEPLOY_REQUIRE_CI=1 gate nothing. A commit that predates
      # .github/workflows/ci.yml has to be deployed with --force.
      log "CI: no checks reported for ${TARGET:0:8} -- deferring to next tick"
      log "CI: (a commit predating .github/workflows/ci.yml needs --force)"
      alert_once "ci-none-${TARGET}" "Algora deploy held: no CI checks reported for ${TARGET:0:8} (${SUBJECT})"
      return 1
      ;;
    pending)
      # A check-run stuck in_progress (runner died, workflow wedged) must not
      # hold deploys forever: remember when this SHA was first seen pending
      # and push through with a warning once DEPLOY_CI_TIMEOUT_MIN passes.
      now=$(date +%s)
      if [ -f "${pending_file}" ]; then
        read -r rec_sha first < "${pending_file}" 2>/dev/null || true
      fi
      case "${first}" in ''|*[!0-9]*) first=0 ;; esac
      if [ "${rec_sha}" != "${TARGET}" ] || [ "${first}" -eq 0 ]; then
        printf '%s %s\n' "${TARGET}" "${now}" > "${pending_file}" 2>/dev/null \
          || log "WARN could not write ${pending_file} -- the stuck-CI timeout will not fire"
        log "CI: still running -- deferring to next tick"
        return 1
      fi
      elapsed=$((now - first))
      if [ "${elapsed}" -lt $((DEPLOY_CI_TIMEOUT_MIN * 60)) ]; then
        log "CI: still running ($((elapsed / 60))m) -- deferring to next tick"
        return 1
      fi
      log "WARN CI pending for over ${DEPLOY_CI_TIMEOUT_MIN}m on ${TARGET:0:8} -- assuming a stuck check-run and proceeding"
      alert_once "ci-timeout-${TARGET}" "Algora deploy: CI pending for over ${DEPLOY_CI_TIMEOUT_MIN}m on ${TARGET:0:8} -- deploying without a green check"
      rm -f "${pending_file}" 2>/dev/null || true
      ;;
    failure)
      log "CI: FAILED -- refusing to deploy ${TARGET:0:8}"
      alert_once "ci-failed-${TARGET}" "Algora deploy skipped: CI failed on ${TARGET:0:8} (${SUBJECT})"
      rm -f "${pending_file}" 2>/dev/null || true
      return 1
      ;;
    *)
      log "CI: status unavailable (network/API) -- deferring to next tick"
      return 1
      ;;
  esac
  return 0
}

# ---------------------------------------------------------------------------
# Live-output snapshot. `pnpm build` overwrites the running processes' own
# files in place, so the last-good outputs are copied aside first and copied
# back when a build fails (see the design notes up top).
# ---------------------------------------------------------------------------
snapshot_outputs() {
  SNAPSHOT_OK=0
  rm -rf "${DEPLOY_BACKUP_DIR}"
  # A build killed mid-write can leave outputs that exist but are garbage;
  # restoring garbage would be worse than the rebuild fallback. Marker files
  # tell a completed build apart (tsc emits dist/index.js, next BUILD_ID).
  if { [ -d apps/api/dist ] && [ ! -f apps/api/dist/index.js ]; } \
     || { [ -d apps/web/.next ] && [ ! -f apps/web/.next/BUILD_ID ]; }; then
    log "WARN live outputs look half-built -- skipping snapshot; a failed build will fall back to a rebuild"
    return 0
  fi
  local d ok=1 found=0
  for d in apps/api/dist apps/web/.next packages/*/dist; do
    [ -d "${d}" ] || continue
    found=1
    mkdir -p "${DEPLOY_BACKUP_DIR}/$(dirname "${d}")" 2>/dev/null || { ok=0; break; }
    if [ "${d}" = "apps/web/.next" ]; then
      # .next/cache is big, regenerated on demand, and excluded from turbo's
      # own outputs list -- leave it out of the snapshot too.
      mkdir -p "${DEPLOY_BACKUP_DIR}/${d}" 2>/dev/null || { ok=0; break; }
      find "${d}" -mindepth 1 -maxdepth 1 ! -name cache \
        -exec cp -a {} "${DEPLOY_BACKUP_DIR}/${d}/" ';' 2>/dev/null || { ok=0; break; }
      [ -f "${DEPLOY_BACKUP_DIR}/${d}/BUILD_ID" ] || { ok=0; break; }
    else
      cp -a "${d}" "${DEPLOY_BACKUP_DIR}/${d}" 2>/dev/null || { ok=0; break; }
    fi
  done
  if [ "${found}" = "1" ] && [ "${ok}" = "1" ]; then
    SNAPSHOT_OK=1
  else
    if [ "${ok}" != "1" ]; then
      log "WARN output snapshot failed (disk?) -- a failed build will fall back to a rebuild"
    fi
    rm -rf "${DEPLOY_BACKUP_DIR}"
  fi
  return 0
}

restore_outputs() {  # 0 = live outputs put back to the pre-build state
  [ "${SNAPSHOT_OK}" = "1" ] || return 1
  [ -d "${DEPLOY_BACKUP_DIR}" ] || return 1
  log "restoring pre-build outputs from ${DEPLOY_BACKUP_DIR#"${REPO_ROOT}"/}/"
  # Carry the (content-addressed) next build cache across the restore so the
  # eventual retry is not a cold build.
  if [ -d apps/web/.next/cache ]; then
    rm -rf "${DEPLOY_BACKUP_DIR}/next-cache-keep"
    mv apps/web/.next/cache "${DEPLOY_BACKUP_DIR}/next-cache-keep" 2>/dev/null || true
  fi
  # Driven by what was snapshotted, not by what the failed build left behind.
  local src d
  for src in "${DEPLOY_BACKUP_DIR}"/apps/api/dist "${DEPLOY_BACKUP_DIR}"/apps/web/.next \
             "${DEPLOY_BACKUP_DIR}"/packages/*/dist; do
    [ -d "${src}" ] || continue
    d=${src#"${DEPLOY_BACKUP_DIR}"/}
    rm -rf "${d}" || { log "ERROR restore: could not clear ${d}"; return 1; }
    mkdir -p "$(dirname "${d}")"
    cp -a "${src}" "${d}" || { log "ERROR restore: could not copy ${d} back"; return 1; }
  done
  if [ -d "${DEPLOY_BACKUP_DIR}/next-cache-keep" ] && [ -d apps/web/.next ]; then
    mv "${DEPLOY_BACKUP_DIR}/next-cache-keep" apps/web/.next/cache 2>/dev/null || true
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Build + restart + health
# ---------------------------------------------------------------------------

# NEVER pass --update-env here. This script runs under pm2 (algora-deploy),
# and pm2 flattens the managed process's own config into its environment —
# cron_restart, autorestart and friends become env vars of this shell.
# `pm2 restart --update-env` merges the CLI's environment into the target's
# stored config, so algora-api inherited algora-deploy's `1-59/5 * * * *`
# cron_restart and was SIGKILLed every 5 minutes (2026-08-05; autorestart
# bleeds the same way). A plain restart keeps the target's registered config
# untouched — verified on pm2 7.0.3. The API re-reads apps/api/.env itself at
# boot, and ecosystem config changes need a delete+start re-registration
# anyway (this script flags that case — see the ECOSYSTEM_CHANGED NOTE).
restart_apps() {
  local api="$1" web="$2"
  RESTART_ATTEMPTED=1
  if [ "${api}" = "1" ]; then
    log "pm2 restart algora-api"
    "${PM2_BIN}" restart algora-api >/dev/null \
      || { log "ERROR pm2 restart algora-api failed"; return 1; }
  fi
  if [ "${web}" = "1" ]; then
    log "pm2 restart algora-web"
    "${PM2_BIN}" restart algora-web >/dev/null \
      || { log "ERROR pm2 restart algora-web failed"; return 1; }
  fi
  # Never `pm2 restart all` here: the box hosts ~20 unrelated projects.

  # A bleed caused by the restarts above should be caught now, not on the next
  # tick (the every-tick call at the top of the flow covers external causes).
  check_config_bleed
}

run_install() {
  # CI=true keeps pnpm non-interactive: over a non-TTY session its
  # "modules will be reinstalled from scratch, proceed?" prompt otherwise
  # hangs forever (bit us on the 2026-08-05 manual deploy).
  CI=true "${PNPM_BIN}" install --frozen-lockfile --reporter=silent \
    || { log "ERROR pnpm install failed"; return 1; }
}

run_build() {
  # turbo caches unchanged packages, so a full build is cheap; NEXT_PUBLIC_*
  # is baked in at web build time, so restarting alone would serve stale env.
  # Full output goes to build-last.log; on failure its tail is copied into
  # the deploy log so the cause survives without shelling into the server.
  mkdir -p "${REPO_ROOT}/logs" 2>/dev/null || true
  "${PNPM_BIN}" build >"${REPO_ROOT}/logs/build-last.log" 2>&1
}

# Build + restart for whatever the current checkout is. Used for the deploy
# and, when no snapshot exists, for the rollback -- so a rollback restores a
# consistent build too.
#
# `set -e` does not apply inside a function invoked as an `if` condition, so
# every step propagates its own failure explicitly.
build_and_restart() {
  local api="$1" web="$2" deps="$3"
  local installed=0

  if [ "${deps}" = "1" ]; then
    log "pnpm install --frozen-lockfile (dependency manifest changed)"
    run_install || return 1
    installed=1
  fi

  if [ "${api}" = "1" ] || [ "${web}" = "1" ]; then
    log "pnpm build"
    if ! run_build; then
      # A stale or corrupted node_modules fails the build even when no
      # manifest changed (the install trigger cannot see rot on disk), so
      # give one install + rebuild a chance before declaring the deploy dead.
      if [ "${installed}" = "1" ]; then
        log "ERROR pnpm build failed -- last lines of logs/build-last.log:"
        tail -20 "${REPO_ROOT}/logs/build-last.log" | while read -r l; do log "  ${l}"; done
        return 1
      fi
      log "pnpm build failed -- retrying once after pnpm install (node_modules may be stale or corrupted)"
      run_install || return 1
      log "pnpm build (retry)"
      if ! run_build; then
        log "ERROR pnpm build failed again -- last lines of logs/build-last.log:"
        tail -20 "${REPO_ROOT}/logs/build-last.log" | while read -r l; do log "  ${l}"; done
        return 1
      fi
    fi
  fi

  restart_apps "${api}" "${web}"
}

health_ok() {
  local i=0
  while [ "${i}" -lt "${DEPLOY_HEALTH_RETRIES}" ]; do
    local api_ok=1 web_ok=1
    if [ "${API_CHANGED}" = "1" ] || [ "${ROLLING_BACK:-0}" = "1" ]; then
      curl -fsS -m 5 "${DEPLOY_API_URL}/api/health" >/dev/null 2>&1 || api_ok=0
    fi
    if [ "${WEB_CHANGED}" = "1" ] || [ "${ROLLING_BACK:-0}" = "1" ]; then
      curl -fsSL -m 8 -o /dev/null "${DEPLOY_WEB_URL}/" 2>/dev/null || web_ok=0
    fi
    if [ "${api_ok}" = "1" ] && [ "${web_ok}" = "1" ]; then
      return 0
    fi
    i=$((i + 1))
    sleep "${DEPLOY_HEALTH_INTERVAL}"
  done
  return 1
}

rollback() {
  ROLLING_BACK=1
  log "ROLLBACK -> ${DEPLOYED:0:8}"
  if git reset --hard --quiet "${DEPLOYED}"; then
    if restore_outputs; then
      # The snapshot IS the last-good build: restarting straight onto it
      # skips a whole rebuild (and the rebuild's own failure modes) in the
      # middle of an incident.
      if restart_apps "${API_CHANGED}" "${WEB_CHANGED}" && health_ok; then
        log "rollback healthy at ${DEPLOYED:0:8} (restored pre-build outputs)"
        alert_once "deploy-rollback-${TARGET}" "Algora deploy of ${TARGET:0:8} failed; rolled back to ${DEPLOYED:0:8} (healthy)"
        return 0
      fi
    else
      if build_and_restart "${API_CHANGED}" "${WEB_CHANGED}" "${DEPS_CHANGED}" && health_ok; then
        log "rollback healthy at ${DEPLOYED:0:8} (rebuilt)"
        alert_once "deploy-rollback-${TARGET}" "Algora deploy of ${TARGET:0:8} failed; rolled back to ${DEPLOYED:0:8} (healthy)"
        return 0
      fi
    fi
  fi
  log "CRITICAL rollback did not come back healthy -- manual intervention needed"
  alert "Algora CRITICAL: deploy of ${TARGET:0:8} failed AND rollback to ${DEPLOYED:0:8} is unhealthy"
  return 1
}

# ---------------------------------------------------------------------------
# The deploy flow. Everything below runs from already-parsed code, so the
# `git reset --hard` updating this very file mid-run cannot corrupt the run.
# ---------------------------------------------------------------------------
main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) FORCE=1 ;;
      --check) CHECK_ONLY=1 ;;
      -h|--help)
        awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' \
          "${BASH_SOURCE[0]}"
        return 0
        ;;
      *) echo "unknown option: $1" >&2; return 64 ;;
    esac
    shift
  done

  mkdir -p "${DEPLOY_STATE_DIR}" 2>/dev/null \
    || log "WARN could not create ${DEPLOY_STATE_DIR} -- state guards degraded"

  acquire_lock || return 0
  trap 'rm -rf "${DEPLOY_LOCK}" 2>/dev/null || true' EXIT

  # -------------------------------------------------------------------------
  # 1. Is there anything to deploy?
  # -------------------------------------------------------------------------
  check_config_bleed

  git fetch --quiet "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}" || {
    log "WARN git fetch failed -- will retry next tick"
    return 0
  }

  HEAD_SHA=$(git rev-parse HEAD)
  TARGET=$(git rev-parse "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}")

  # The baseline is the last commit that finished build + restart + health,
  # not HEAD (see the design notes). Missing/invalid state (first run, GC'd
  # SHA) falls back to HEAD -- and the fallback is persisted BEFORE the reset
  # below moves HEAD, otherwise a "reset succeeded, build failed" tick would
  # fall back to the already-advanced HEAD next time and mask the failure.
  DEPLOYED=$(cat "${DEPLOY_STATE_DIR}/deployed-sha" 2>/dev/null || true)
  if [ -z "${DEPLOYED}" ] || ! git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null; then
    if [ -n "${DEPLOYED}" ]; then
      log "WARN recorded deploy state '${DEPLOYED}' is not a commit here -- treating HEAD as deployed"
    fi
    DEPLOYED=${HEAD_SHA}
    mark_deployed "${DEPLOYED}" || return 1
  fi

  if [ "${DEPLOYED}" = "${TARGET}" ] && [ "${HEAD_SHA}" = "${TARGET}" ]; then
    if [ "${DEPLOY_VERBOSE}" = "1" ] || [ "${CHECK_ONLY}" = "1" ]; then
      log "up to date at ${TARGET:0:8}"
    fi
    return 0
  fi

  SUBJECT=$(git log -1 --format='%s' "${TARGET}")
  log "update available: ${DEPLOYED:0:8} -> ${TARGET:0:8} (${SUBJECT})"
  if [ "${DEPLOYED}" != "${HEAD_SHA}" ]; then
    log "NOTE HEAD is ${HEAD_SHA:0:8} but the last successful deploy is ${DEPLOYED:0:8} -- an earlier deploy did not complete; re-deploying from the last-good baseline"
  fi

  load_failure_state
  if [ "${CHECK_ONLY}" = "0" ] && [ "${FORCE}" = "0" ] && in_backoff; then
    return 0
  fi

  # -------------------------------------------------------------------------
  # 2. Guards
  # -------------------------------------------------------------------------
  local branch_now
  branch_now=$(git rev-parse --abbrev-ref HEAD)
  if [ "${branch_now}" != "${DEPLOY_BRANCH}" ] && [ "${FORCE}" = "0" ]; then
    log "ABORT checkout is on '${branch_now}', not '${DEPLOY_BRANCH}' -- not touching it"
    return 0
  fi

  # Tracked-file edits made by hand on the server would be silently discarded
  # by the reset below, so stop and let a human look. Untracked files (.env,
  # the DB) are never at risk and are deliberately not checked.
  if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${FORCE}" = "0" ]; then
    log "ABORT working tree has local modifications to tracked files:"
    git status --short --untracked-files=no | while read -r l; do log "       ${l}"; done
    log "       resolve on the server, or re-run with --force to discard them"
    alert_once "dirty-tree-${TARGET}" "Algora deploy blocked: local modifications on the server checkout"
    return 0
  fi

  # Local commits would be destroyed outright by `reset --hard` -- unlike the
  # dirty-tree case there is no reflog-free recovery for a hand-made fix that
  # was never pushed. HEAD must be an ancestor of the target (HEAD == TARGET
  # trivially passes; the interrupted-deploy case, HEAD ahead of DEPLOYED but
  # on the remote's history, passes too).
  if [ "${FORCE}" = "0" ] && ! git merge-base --is-ancestor "${HEAD_SHA}" "${TARGET}" 2>/dev/null; then
    log "ABORT server checkout has commits that are not on ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}:"
    git log --oneline "${TARGET}..${HEAD_SHA}" 2>/dev/null | head -5 | while read -r l; do log "       ${l}"; done
    log "       push or remove them, or re-run with --force to discard them"
    alert_once "local-commits-${HEAD_SHA}" "Algora deploy blocked: local commits on the server checkout (HEAD ${HEAD_SHA:0:8} not on ${DEPLOY_REMOTE}/${DEPLOY_BRANCH})"
    return 0
  fi

  if [ "${DEPLOY_REQUIRE_CI}" = "1" ] && [ "${FORCE}" = "0" ]; then
    ci_gate || return 0
  fi

  # What kind of change is this? packages/* and root build config feed both
  # apps through turbo, so they mark both. Docs-only changes are synced
  # (checkout reset so on-server docs stay current) but not deployed. The
  # comparison span is last-good -> remote, so changes an earlier failed
  # deploy never shipped are re-included automatically.
  local changed f
  changed=$(git diff --name-only "${DEPLOYED}" "${TARGET}")
  while IFS= read -r f; do
    [ -n "${f}" ] || continue
    case "${f}" in
      apps/api/*) API_CHANGED=1 ;;
      apps/web/*) WEB_CHANGED=1 ;;
      packages/*|package.json|turbo.json|tsconfig*.json) API_CHANGED=1; WEB_CHANGED=1 ;;
    esac
    # Any dependency-manifest change triggers an install, not just the
    # lockfile: a package.json bumped without its lockfile used to skip the
    # install and then fail the build on every tick until someone shelled in.
    # (`--frozen-lockfile` still fails loudly on a real manifest/lockfile
    # mismatch -- correctly, since that commit could never build.) An
    # unchanged-manifest install is close to a no-op, so over-triggering is
    # cheap.
    case "${f}" in
      pnpm-lock.yaml|pnpm-workspace.yaml|package.json|*/package.json)
        DEPS_CHANGED=1; API_CHANGED=1; WEB_CHANGED=1 ;;
      ecosystem.config.cjs) ECOSYSTEM_CHANGED=1 ;;
    esac
  done <<EOF
${changed}
EOF

  if [ "${CHECK_ONLY}" = "1" ]; then
    log "--check: would deploy ${TARGET:0:8} (api=${API_CHANGED} web=${WEB_CHANGED} \
deps=${DEPS_CHANGED} ecosystem=${ECOSYSTEM_CHANGED})"
    if [ "${FAILURE_COUNT}" -ge 1 ]; then
      log "--check: ${TARGET:0:8} has ${FAILURE_COUNT} failed attempt(s); retries are paced by backoff"
    fi
    return 0
  fi

  # -------------------------------------------------------------------------
  # 3. Deploy
  # -------------------------------------------------------------------------

  # Pre-deploy snapshot via the repo's own online-backup script (non-fatal): a
  # restore point from immediately before this change, on top of the 6-hourly
  # algora-db-backup cron.
  if [ "${API_CHANGED}" = "1" ] && [ -f "apps/api/scripts/backup-db.ts" ]; then
    if (cd apps/api && node_modules/.bin/tsx scripts/backup-db.ts --verify) >/dev/null 2>&1; then
      log "pre-deploy DB snapshot written to apps/api/data/backup/"
    else
      log "WARN pre-deploy DB snapshot failed (continuing)"
    fi
  fi

  log "checking out ${TARGET:0:8}"
  git reset --hard --quiet "${TARGET}"

  if [ "${ECOSYSTEM_CHANGED}" = "1" ]; then
    log "NOTE ecosystem.config.cjs changed -- process definitions (cron, env) are"
    log "     NOT re-registered automatically. Run on the server, per changed app:"
    log "     pm2 delete <app> && pm2 start ecosystem.config.cjs --only <app> && pm2 save"
    log "     (pm2 restart --update-env merges but never clears keys -- it cannot"
    log "     remove a cron_restart or revert autorestart; delete+start is the"
    log "     only reliable re-registration)"
  fi

  if [ "${API_CHANGED}" = "0" ] && [ "${WEB_CHANGED}" = "0" ]; then
    log "SYNCED ${DEPLOYED:0:8} -> ${TARGET:0:8} (docs/scripts only -- checkout updated, no deploy)"
    mark_deployed "${TARGET}" || return 1
    clear_failure
    return 0
  fi

  snapshot_outputs

  if ! build_and_restart "${API_CHANGED}" "${WEB_CHANGED}" "${DEPS_CHANGED}"; then
    record_failure
    if [ "${RESTART_ATTEMPTED}" = "0" ]; then
      # The failure happened before any pm2 restart: the running processes
      # still hold the last-good code, so restoring the on-disk outputs is a
      # complete recovery -- no restart, no rebuild. The checkout stays at
      # TARGET (harmless: runtime reads only the outputs) and the unchanged
      # deployed-sha makes a later tick retry the whole deploy.
      log "ERROR build failed before any restart -- live processes untouched"
      if restore_outputs; then
        log "live outputs restored to the ${DEPLOYED:0:8} build"
      else
        log "WARN no usable snapshot -- on-disk outputs may be from the failed build (processes still run the old code until restarted)"
      fi
      alert_once "deploy-failed-${TARGET}" "Algora deploy of ${TARGET:0:8} failed at build; live processes untouched; retrying with backoff"
      return 1
    fi
    log "ERROR build/restart failed"
    rollback || return 1
    return 1
  fi

  if ! health_ok; then
    log "ERROR health check failed after deploy"
    record_failure
    rollback || return 1
    return 1
  fi

  # Only a fully healthy deploy moves the baseline; everything above returns
  # early and leaves deployed-sha (and therefore the next tick's retry) alone.
  mark_deployed "${TARGET}" || return 1
  clear_failure
  rm -rf "${DEPLOY_BACKUP_DIR}"
  log "DEPLOYED ${DEPLOYED:0:8} -> ${TARGET:0:8}"
  git log --oneline "${DEPLOYED}..${TARGET}" | head -10 | while read -r l; do log "       ${l}"; done
  return 0
}

main "$@"
exit $?
