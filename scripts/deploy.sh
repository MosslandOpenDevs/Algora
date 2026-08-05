#!/usr/bin/env bash
#
# Algora pull-based auto-deploy.
#
# Runs ON the application server (the box PM2 lives on) and brings the checkout
# up to origin/main. Idempotent: when HEAD already equals the remote tip it does
# nothing and exits 0, so it is safe to run from PM2's cron every few minutes.
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
# Usage:
#   scripts/deploy.sh              # deploy if the remote moved (normal cron use)
#   scripts/deploy.sh --check      # report what would happen, change nothing
#   scripts/deploy.sh --force      # ignore the CI gate and dirty-tree guard
#
# Configuration (env, all optional):
#   DEPLOY_BRANCH          branch to track                     (default: main)
#   DEPLOY_REMOTE          git remote                          (default: origin)
#   DEPLOY_REQUIRE_CI      1 = only deploy CI-green commits    (default: 0 —
#                          this repo has no GitHub Actions yet; flip to 1 when
#                          CI lands. Needs GITHUB_TOKEN on a box whose
#                          unauthenticated GitHub quota is consumed by the
#                          Algora collectors.)
#   DEPLOY_GITHUB_REPO     owner/name used for the CI query
#   DEPLOY_API_URL         backend health URL                  (:3201)
#   DEPLOY_WEB_URL         frontend health URL                 (:3200)
#   DEPLOY_HEALTH_RETRIES  health poll attempts                (default: 20)
#   DEPLOY_HEALTH_INTERVAL seconds between attempts            (default: 3)
#   DEPLOY_ALERT_WEBHOOK   Slack/Discord webhook for failures  (default: none)
#   DEPLOY_VERBOSE         1 = also log no-op ticks            (default: 0)
#   PM2_BIN / PNPM_BIN / GITHUB_TOKEN
#
# Data safety: this script only ever runs `git reset --hard`, which leaves
# untracked files alone. It must NEVER run `git clean` — .env,
# apps/api/data/algora.db and apps/api/data/backup/ live on the server and are
# untracked.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/.." && pwd)
cd "${REPO_ROOT}"

DEPLOY_BRANCH=${DEPLOY_BRANCH:-main}
DEPLOY_REMOTE=${DEPLOY_REMOTE:-origin}
DEPLOY_REQUIRE_CI=${DEPLOY_REQUIRE_CI:-0}
DEPLOY_GITHUB_REPO=${DEPLOY_GITHUB_REPO:-MosslandOpenDevs/Algora}
DEPLOY_API_URL=${DEPLOY_API_URL:-http://127.0.0.1:3201}
DEPLOY_WEB_URL=${DEPLOY_WEB_URL:-http://127.0.0.1:3200}
DEPLOY_HEALTH_RETRIES=${DEPLOY_HEALTH_RETRIES:-20}
DEPLOY_HEALTH_INTERVAL=${DEPLOY_HEALTH_INTERVAL:-3}
DEPLOY_ALERT_WEBHOOK=${DEPLOY_ALERT_WEBHOOK:-}
DEPLOY_VERBOSE=${DEPLOY_VERBOSE:-0}
DEPLOY_LOG=${DEPLOY_LOG:-${REPO_ROOT}/logs/deploy.log}
DEPLOY_LOCK=${DEPLOY_LOCK:-${REPO_ROOT}/logs/.deploy.lock}
DEPLOY_LOCK_STALE_MIN=${DEPLOY_LOCK_STALE_MIN:-90}

PM2_BIN=${PM2_BIN:-pm2}
PNPM_BIN=${PNPM_BIN:-pnpm}

# pm2 flattens the managed process's own config into its child environment, so
# under the algora-deploy cron this shell literally has cron_restart,
# autorestart etc. as env vars. Scrub them so no pm2 invocation from this
# script can ever merge them into a target app's stored config (the 2026-08-05
# `--update-env` incident class — see build_and_restart).
unset cron_restart autorestart watch max_memory_restart

FORCE=0
CHECK_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,45p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
  shift
done

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
# Single-flight lock. A crash mid-deploy would otherwise wedge every later tick,
# so a lock older than DEPLOY_LOCK_STALE_MIN is reclaimed.
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "${DEPLOY_LOCK}")"
if ! mkdir "${DEPLOY_LOCK}" 2>/dev/null; then
  if [ -n "$(find "${DEPLOY_LOCK}" -maxdepth 0 -mmin "+${DEPLOY_LOCK_STALE_MIN}" 2>/dev/null)" ]; then
    log "WARN stale lock older than ${DEPLOY_LOCK_STALE_MIN}m -- reclaiming"
    rm -rf "${DEPLOY_LOCK}"
    mkdir "${DEPLOY_LOCK}" 2>/dev/null || { log "could not reclaim lock; skipping"; exit 0; }
  else
    [ "${DEPLOY_VERBOSE}" = "1" ] && log "another deploy is running -- skipping"
    exit 0
  fi
fi
trap 'rm -rf "${DEPLOY_LOCK}" 2>/dev/null || true' EXIT

# ---------------------------------------------------------------------------
# 1. Is there anything to deploy?
# ---------------------------------------------------------------------------
check_config_bleed

git fetch --quiet "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}" || {
  log "WARN git fetch failed -- will retry next tick"
  exit 0
}

CURRENT=$(git rev-parse HEAD)
TARGET=$(git rev-parse "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}")

if [ "${CURRENT}" = "${TARGET}" ]; then
  if [ "${DEPLOY_VERBOSE}" = "1" ] || [ "${CHECK_ONLY}" = "1" ]; then
    log "up to date at ${CURRENT:0:8}"
  fi
  exit 0
fi

CHANGED=$(git diff --name-only "${CURRENT}" "${TARGET}")
SUBJECT=$(git log -1 --format='%s' "${TARGET}")
log "update available: ${CURRENT:0:8} -> ${TARGET:0:8} (${SUBJECT})"

# ---------------------------------------------------------------------------
# 2. Guards
# ---------------------------------------------------------------------------
BRANCH_NOW=$(git rev-parse --abbrev-ref HEAD)
if [ "${BRANCH_NOW}" != "${DEPLOY_BRANCH}" ] && [ "${FORCE}" = "0" ]; then
  log "ABORT checkout is on '${BRANCH_NOW}', not '${DEPLOY_BRANCH}' -- not touching it"
  exit 0
fi

# Tracked-file edits made by hand on the server would be silently discarded by
# the reset below, so stop and let a human look. Untracked files (.env, the DB)
# are never at risk and are deliberately not checked.
if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${FORCE}" = "0" ]; then
  log "ABORT working tree has local modifications to tracked files:"
  git status --short --untracked-files=no | while read -r l; do log "       ${l}"; done
  log "       resolve on the server, or re-run with --force to discard them"
  alert "Algora deploy blocked: local modifications on the server checkout"
  exit 0
fi

# CI gate: deploy only commits GitHub Actions has gone green on.
ci_conclusion() {
  local sha="$1" url auth
  url="https://api.github.com/repos/${DEPLOY_GITHUB_REPO}/commits/${sha}/check-runs"
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

if [ "${DEPLOY_REQUIRE_CI}" = "1" ] && [ "${FORCE}" = "0" ]; then
  CI_STATUS=$(ci_conclusion "${TARGET}")
  case "${CI_STATUS}" in
    success) log "CI: green" ;;
    none)    log "CI: no checks reported for this commit -- proceeding" ;;
    pending) log "CI: still running -- deferring to next tick"; exit 0 ;;
    failure) log "CI: FAILED -- refusing to deploy ${TARGET:0:8}"
             alert "Algora deploy skipped: CI failed on ${TARGET:0:8} (${SUBJECT})"
             exit 0 ;;
    *)       log "CI: status unavailable (network/API) -- deferring to next tick"; exit 0 ;;
  esac
fi

# What kind of change is this? packages/* and root build config feed both apps
# through turbo, so they mark both. Docs-only changes are synced (checkout
# reset so on-server docs stay current) but not deployed.
API_CHANGED=0
WEB_CHANGED=0
DEPS_CHANGED=0
ECOSYSTEM_CHANGED=0
while IFS= read -r f; do
  [ -n "${f}" ] || continue
  case "${f}" in
    apps/api/*) API_CHANGED=1 ;;
    apps/web/*) WEB_CHANGED=1 ;;
    packages/*|package.json|turbo.json|tsconfig*.json) API_CHANGED=1; WEB_CHANGED=1 ;;
  esac
  case "${f}" in
    pnpm-lock.yaml) DEPS_CHANGED=1; API_CHANGED=1; WEB_CHANGED=1 ;;
    ecosystem.config.cjs) ECOSYSTEM_CHANGED=1 ;;
  esac
done <<EOF
${CHANGED}
EOF

if [ "${CHECK_ONLY}" = "1" ]; then
  log "--check: would deploy ${TARGET:0:8} (api=${API_CHANGED} web=${WEB_CHANGED} \
deps=${DEPS_CHANGED} ecosystem=${ECOSYSTEM_CHANGED})"
  exit 0
fi

# ---------------------------------------------------------------------------
# 3. Deploy
# ---------------------------------------------------------------------------

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

# Build + restart for whatever the current checkout is. Used for the deploy and,
# unchanged, for the rollback -- so a rollback restores a consistent build too.
#
# `set -e` does not apply inside a function invoked as an `if` condition, so
# every step propagates its own failure explicitly.
build_and_restart() {
  local api="$1" web="$2" deps="$3"

  if [ "${deps}" = "1" ]; then
    # CI=true keeps pnpm non-interactive: over a non-TTY session its
    # "modules will be reinstalled from scratch, proceed?" prompt otherwise
    # hangs forever (bit us on the 2026-08-05 manual deploy).
    log "pnpm install --frozen-lockfile (lockfile changed)"
    CI=true "${PNPM_BIN}" install --frozen-lockfile --reporter=silent \
      || { log "ERROR pnpm install failed"; return 1; }
  fi

  if [ "${api}" = "1" ] || [ "${web}" = "1" ]; then
    # turbo caches unchanged packages, so a full build is cheap; NEXT_PUBLIC_*
    # is baked in at web build time, so restarting alone would serve stale env.
    # Full output goes to build-last.log; on failure its tail is copied into
    # the deploy log so the cause survives without shelling into the server.
    log "pnpm build"
    if ! "${PNPM_BIN}" build >"${REPO_ROOT}/logs/build-last.log" 2>&1; then
      log "ERROR pnpm build failed -- last lines of logs/build-last.log:"
      tail -20 "${REPO_ROOT}/logs/build-last.log" | while read -r l; do log "  ${l}"; done
      return 1
    fi
  fi

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
  log "ROLLBACK -> ${CURRENT:0:8}"
  git reset --hard --quiet "${CURRENT}"
  if build_and_restart "${API_CHANGED}" "${WEB_CHANGED}" "${DEPS_CHANGED}"; then
    if health_ok; then
      log "rollback healthy at ${CURRENT:0:8}"
      alert "Algora deploy of ${TARGET:0:8} failed; rolled back to ${CURRENT:0:8} (healthy)"
      return 0
    fi
  fi
  log "CRITICAL rollback did not come back healthy -- manual intervention needed"
  alert "Algora CRITICAL: deploy of ${TARGET:0:8} failed AND rollback to ${CURRENT:0:8} is unhealthy"
  return 1
}

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
  log "SYNCED ${CURRENT:0:8} -> ${TARGET:0:8} (docs/scripts only -- checkout updated, no deploy)"
  exit 0
fi

if ! build_and_restart "${API_CHANGED}" "${WEB_CHANGED}" "${DEPS_CHANGED}"; then
  log "ERROR build/restart failed"
  rollback || exit 1
  exit 1
fi

if ! health_ok; then
  log "ERROR health check failed after deploy"
  rollback || exit 1
  exit 1
fi

log "DEPLOYED ${CURRENT:0:8} -> ${TARGET:0:8}"
git log --oneline "${CURRENT}..${TARGET}" | head -10 | while read -r l; do log "       ${l}"; done
exit 0
