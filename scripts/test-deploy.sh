#!/usr/bin/env bash
#
# Behavioural tests for scripts/deploy.sh (the pull-based auto-deployer).
#
# The script is what stands between `git push` and production, so it is tested
# by actually running it: each scenario builds a throwaway origin + server
# checkout pair and puts stub `pm2`, `pnpm` and `curl` executables first on
# PATH, so the real script takes its real code paths against fake
# infrastructure (same approach as agentic-orchestrator's tests/test_deploy.py,
# in bash so this repo needs no extra toolchain).
#
# What is deliberately pinned here:
#   * the no-op fast path (it runs every 5 minutes -- it must stay free),
#   * the last-good-SHA baseline: a failed or interrupted deploy is retried,
#     and only a healthy deploy advances the state,
#   * a failed build restores the live outputs and never restarts pm2,
#   * failed SHAs back off instead of re-deploying every tick,
#   * local commits on the server stop the deploy instead of being reset away,
#   * a lock left by a dead deploy is reclaimed on the next tick,
#   * a pending CI holds deploys -- but not forever (stuck-check-run timeout).
#
# Usage:  bash scripts/test-deploy.sh          # runs all scenarios, exits 0/1
#         KEEP_TMP=1 bash scripts/test-deploy.sh   # keep sandboxes for a look
#
# Requires bash + git + node; runs offline (all remotes are local paths).

set -u

TESTS_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
DEPLOY_SH="${TESTS_ROOT}/scripts/deploy.sh"

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

FAILS=0
TESTS=0
CURRENT=""
SANDBOXES=""

note() { printf '%s\n' "$*"; }

begin() {
  CURRENT="$1"
  TESTS=$((TESTS + 1))
  note "== ${CURRENT}"
  new_sandbox
}

fail() {
  FAILS=$((FAILS + 1))
  note "   FAIL: $*"
}

assert_rc() {  # expected
  [ "${RC}" = "$1" ] || fail "exit code ${RC}, expected $1 (output: ${RUN_OUT})"
}

assert_log() {  # pattern present in the deploy run output
  grep -q "$1" "${RUN_OUT}" || fail "expected '$1' in run output"
}

assert_stub() {  # pattern present in stub call log
  grep -q "$1" "${STUB_LOG}" || fail "expected stub call '$1'"
}

assert_no_stub() {
  ! grep -q "$1" "${STUB_LOG}" || fail "did not expect stub call '$1'"
}

assert_eq() {  # actual expected what
  [ "$1" = "$2" ] || fail "$3: got '$1', expected '$2'"
}

# ---------------------------------------------------------------------------
# Sandbox: bare origin + seed pusher + server checkout + stub bin
# ---------------------------------------------------------------------------
new_sandbox() {
  SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/algora-deploy-test.XXXXXX")
  SANDBOXES="${SANDBOXES} ${SANDBOX}"
  ORIGIN="${SANDBOX}/origin.git"
  SEED="${SANDBOX}/seed"
  CHECKOUT="${SANDBOX}/checkout"
  STUB_BIN="${SANDBOX}/bin"
  STUB_DIR="${SANDBOX}/stub-state"
  STUB_LOG="${SANDBOX}/stub.log"
  RUN_OUT="${SANDBOX}/run.out"
  mkdir -p "${STUB_BIN}" "${STUB_DIR}"
  : > "${STUB_LOG}"

  git init --quiet --bare -b main "${ORIGIN}" 2>/dev/null \
    || git -c init.defaultBranch=main init --quiet --bare "${ORIGIN}"

  mkdir -p "${SEED}"
  git -C "${SEED}" init --quiet -b main 2>/dev/null \
    || git -C "${SEED}" -c init.defaultBranch=main init --quiet
  mkdir -p "${SEED}/apps/api/src" "${SEED}/apps/web/src" "${SEED}/packages/core/src"
  echo "export const V = 1;" > "${SEED}/apps/api/src/index.ts"
  echo "export default 1;" > "${SEED}/apps/web/src/page.tsx"
  echo "export const core = 1;" > "${SEED}/packages/core/src/index.ts"
  echo '{"name":"algora"}' > "${SEED}/package.json"
  echo "lockfileVersion: 9" > "${SEED}/pnpm-lock.yaml"
  echo "seed" > "${SEED}/README.md"
  git -C "${SEED}" add -A
  git -C "${SEED}" commit --quiet -m "seed"
  git -C "${SEED}" remote add origin "${ORIGIN}"
  git -C "${SEED}" push --quiet origin main

  git clone --quiet "${ORIGIN}" "${CHECKOUT}"
  # The script under test rides along untracked, so the dirty-tree guard
  # (tracked files only) never sees it.
  mkdir -p "${CHECKOUT}/scripts"
  cp "${DEPLOY_SH}" "${CHECKOUT}/scripts/deploy.sh"

  write_stubs
}

write_stubs() {
  cat > "${STUB_BIN}/pm2" <<'STUB'
#!/usr/bin/env bash
echo "pm2 $*" >> "${STUB_LOG}"
case "${1:-}" in
  jlist) echo "[]" ;;
  restart)
    n=$(cat "${STUB_DIR}/restart-fails-remaining" 2>/dev/null || echo 0)
    if [ "${n}" -gt 0 ] 2>/dev/null; then
      echo $((n - 1)) > "${STUB_DIR}/restart-fails-remaining"
      exit 1
    fi ;;
esac
exit 0
STUB
  cat > "${STUB_BIN}/pnpm" <<'STUB'
#!/usr/bin/env bash
echo "pnpm $*" >> "${STUB_LOG}"
case "${1:-}" in
  install)
    [ ! -f "${STUB_DIR}/install-fail" ] || exit 1 ;;
  build)
    n=$(cat "${STUB_DIR}/build-fails-remaining" 2>/dev/null || echo 0)
    if [ "${n}" -gt 0 ] 2>/dev/null; then
      echo $((n - 1)) > "${STUB_DIR}/build-fails-remaining"
      # a real failed build leaves half-written outputs behind
      mkdir -p apps/api/dist apps/web/.next
      echo "BROKEN" > apps/api/dist/index.js
      rm -f apps/web/.next/BUILD_ID
      echo "stub build: simulated failure"
      exit 1
    fi
    sha=$(git rev-parse --short=8 HEAD)
    mkdir -p apps/api/dist apps/web/.next apps/web/.next/cache packages/core/dist
    echo "BUILD:${sha}" > apps/api/dist/index.js
    echo "${sha}" > apps/web/.next/BUILD_ID
    echo "cache" > apps/web/.next/cache/entry
    echo "BUILD:${sha}" > packages/core/dist/index.js
    echo "stub build: ok at ${sha}" ;;
esac
exit 0
STUB
  cat > "${STUB_BIN}/curl" <<'STUB'
#!/usr/bin/env bash
echo "curl $*" >> "${STUB_LOG}"
for a in "$@"; do
  case "${a}" in
    *api.github.com*)
      cat "${STUB_DIR}/ci-response" 2>/dev/null || echo '{"check_runs":[]}'
      exit 0 ;;
    *127.0.0.1*)
      [ ! -f "${STUB_DIR}/health-fail" ] || exit 7
      exit 0 ;;
  esac
done
exit 0
STUB
  chmod +x "${STUB_BIN}/pm2" "${STUB_BIN}/pnpm" "${STUB_BIN}/curl"
}

run_deploy() {
  : > "${STUB_LOG}"
  set +e
  (
    cd "${CHECKOUT}" \
      && PATH="${STUB_BIN}:${PATH}" STUB_LOG="${STUB_LOG}" STUB_DIR="${STUB_DIR}" \
         DEPLOY_HEALTH_RETRIES="${DEPLOY_HEALTH_RETRIES:-2}" DEPLOY_HEALTH_INTERVAL=0 \
         DEPLOY_VERBOSE=1 bash scripts/deploy.sh "$@"
  ) >"${RUN_OUT}" 2>&1
  RC=$?
  set -e
  set +e  # the suite itself stays permissive; assertions do the judging
}

push_change() {  # <file> <content> <message>
  mkdir -p "${SEED}/$(dirname "$1")"
  echo "$2" > "${SEED}/$1"
  git -C "${SEED}" add -A
  git -C "${SEED}" commit --quiet -m "$3"
  git -C "${SEED}" push --quiet origin main
}

origin_sha() { git -C "${SEED}" rev-parse HEAD; }
head_sha() { git -C "${CHECKOUT}" rev-parse HEAD; }
state_sha() { cat "${CHECKOUT}/.git/algora-deploy/deployed-sha" 2>/dev/null || echo "<none>"; }

# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

test_noop_tick() {
  begin "no-op tick: up to date stays free and initializes the baseline"
  run_deploy
  assert_rc 0
  assert_log "up to date"
  assert_no_stub "pnpm build"
  assert_no_stub "pm2 restart"
  assert_eq "$(state_sha)" "$(head_sha)" "baseline persisted on first tick"
}

test_api_deploy() {
  begin "api change: build + api restart only, baseline advances"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  local before
  before=$(head_sha)
  run_deploy --check
  assert_rc 0
  assert_log "would deploy"
  assert_no_stub "pnpm build"
  assert_eq "$(head_sha)" "${before}" "--check changed nothing"
  run_deploy
  assert_rc 0
  assert_stub "pnpm build"
  assert_stub "pm2 restart algora-api"
  assert_no_stub "pm2 restart algora-web"
  assert_no_stub "pnpm install"
  assert_log "DEPLOYED"
  assert_eq "$(state_sha)" "$(origin_sha)" "baseline == origin tip"
  assert_eq "$(head_sha)" "$(origin_sha)" "checkout == origin tip"
}

test_manifest_triggers_install() {
  begin "package.json change without lockfile still triggers pnpm install"
  push_change apps/api/package.json '{"name":"@algora/api","dependencies":{}}' "chore(api): bump dep"
  run_deploy
  assert_rc 0
  assert_stub "pnpm install --frozen-lockfile"
  assert_stub "pnpm build"
}

test_docs_only_sync() {
  begin "docs-only change: synced, no build, baseline advances"
  push_change README.md "updated docs" "docs: update"
  run_deploy
  assert_rc 0
  assert_log "SYNCED"
  assert_no_stub "pnpm build"
  assert_no_stub "pm2 restart"
  assert_eq "$(state_sha)" "$(origin_sha)" "baseline == origin tip after sync"
}

test_build_failure_restores_and_backs_off() {
  begin "failed build: outputs restored, no restart, baseline pinned, backoff, --force retry"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  run_deploy
  assert_rc 0
  local good_sha
  good_sha=$(origin_sha)

  push_change apps/api/src/index.ts "export const V = 3;" "feat(api): v3 (broken)"
  echo 2 > "${STUB_DIR}/build-fails-remaining"   # first build AND the post-install retry
  run_deploy
  assert_rc 1
  assert_log "retrying once after pnpm install"
  assert_stub "pnpm install --frozen-lockfile"
  assert_log "live processes untouched"
  assert_no_stub "pm2 restart"
  assert_eq "$(cat "${CHECKOUT}/apps/api/dist/index.js")" "BUILD:$(git -C "${CHECKOUT}" rev-parse --short=8 "${good_sha}")" \
    "live api output restored to last-good build"
  [ -f "${CHECKOUT}/apps/web/.next/BUILD_ID" ] || fail "web BUILD_ID not restored"
  assert_eq "$(state_sha)" "${good_sha}" "baseline still last-good after failed build"
  [ -f "${CHECKOUT}/.git/algora-deploy/failure" ] || fail "failure not recorded"

  run_deploy
  assert_rc 0
  assert_log "backoff"
  assert_no_stub "pnpm build"

  run_deploy --force
  assert_rc 0
  assert_log "DEPLOYED"
  assert_eq "$(state_sha)" "$(origin_sha)" "baseline advanced after forced successful retry"
  [ ! -f "${CHECKOUT}/.git/algora-deploy/failure" ] || fail "failure state not cleared on success"
}

test_interrupted_deploy_resumes() {
  begin "interrupted deploy (HEAD ahead of baseline) is finished on the next tick"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  run_deploy
  assert_rc 0
  # Simulate the old failure mode: a deploy that died right after reset --hard.
  push_change apps/api/src/index.ts "export const V = 3;" "feat(api): v3"
  git -C "${CHECKOUT}" fetch --quiet origin main
  git -C "${CHECKOUT}" reset --hard --quiet origin/main
  run_deploy
  assert_rc 0
  assert_log "did not complete"
  assert_stub "pnpm build"
  assert_stub "pm2 restart algora-api"
  assert_eq "$(state_sha)" "$(origin_sha)" "baseline caught up after resumed deploy"
}

test_local_commits_block() {
  begin "local server commits stop the deploy instead of being reset away"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  echo "hand-made hotfix" > "${CHECKOUT}/README.md"
  git -C "${CHECKOUT}" commit --quiet -am "server hotfix"
  local local_sha
  local_sha=$(head_sha)
  run_deploy
  assert_rc 0
  assert_log "ABORT server checkout has commits"
  assert_no_stub "pnpm build"
  assert_no_stub "pm2 restart"
  assert_eq "$(head_sha)" "${local_sha}" "local commit survived the tick"
}

test_dead_lock_reclaimed() {
  begin "lock left by a dead deploy is reclaimed immediately"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  mkdir -p "${CHECKOUT}/logs/.deploy.lock"
  echo 99999999 > "${CHECKOUT}/logs/.deploy.lock/pid"
  run_deploy
  assert_rc 0
  assert_log "reclaiming lock"
  assert_log "DEPLOYED"
}

test_restart_failure_rolls_back_from_snapshot() {
  begin "failed restart: rollback restores the snapshot without a rebuild"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  run_deploy
  assert_rc 0
  local good_sha builds
  good_sha=$(origin_sha)

  push_change apps/api/src/index.ts "export const V = 3;" "feat(api): v3"
  echo 1 > "${STUB_DIR}/restart-fails-remaining"
  run_deploy
  assert_rc 1
  assert_log "ROLLBACK"
  assert_log "rollback healthy"
  assert_log "restored pre-build outputs"
  builds=$(grep -c "pnpm build" "${STUB_LOG}")
  assert_eq "${builds}" "1" "rollback did not rebuild (snapshot fast path)"
  assert_eq "$(cat "${CHECKOUT}/apps/api/dist/index.js")" "BUILD:$(git -C "${CHECKOUT}" rev-parse --short=8 "${good_sha}")" \
    "live api output rolled back to last-good build"
  assert_eq "$(head_sha)" "${good_sha}" "checkout rolled back"
  assert_eq "$(state_sha)" "${good_sha}" "baseline still last-good"
  [ -f "${CHECKOUT}/.git/algora-deploy/failure" ] || fail "failure not recorded"
}

test_ci_pending_defers_then_times_out() {
  begin "pending CI defers the deploy but a stuck check-run cannot hold it forever"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  echo '{"check_runs":[{"status":"in_progress"}]}' > "${STUB_DIR}/ci-response"
  DEPLOY_REQUIRE_CI=1 run_deploy
  assert_rc 0
  assert_log "CI: still running"
  assert_no_stub "pnpm build"
  [ -f "${CHECKOUT}/.git/algora-deploy/ci-pending" ] || fail "ci-pending timer not started"

  # Backdate the first-seen timestamp past the timeout and tick again.
  mkdir -p "${CHECKOUT}/.git/algora-deploy"
  printf '%s %s\n' "$(origin_sha)" "$(($(date +%s) - 3600))" \
    > "${CHECKOUT}/.git/algora-deploy/ci-pending"
  DEPLOY_REQUIRE_CI=1 run_deploy
  assert_rc 0
  assert_log "assuming a stuck check-run"
  assert_stub "pnpm build"
  assert_eq "$(state_sha)" "$(origin_sha)" "deploy went through after the CI timeout"
}

test_untracked_state_survives() {
  begin "untracked server state (.env, DB) survives a deploy"
  echo "SECRET=1" > "${CHECKOUT}/.env"
  mkdir -p "${CHECKOUT}/apps/api/data"
  echo "SQLITE" > "${CHECKOUT}/apps/api/data/algora.db"
  push_change apps/api/src/index.ts "export const V = 2;" "feat(api): v2"
  run_deploy
  assert_rc 0
  assert_eq "$(cat "${CHECKOUT}/.env")" "SECRET=1" ".env survived"
  assert_eq "$(cat "${CHECKOUT}/apps/api/data/algora.db")" "SQLITE" "DB survived"
}

# ---------------------------------------------------------------------------

# shellcheck disable=SC2329  # invoked via the EXIT trap below
cleanup() {
  if [ "${KEEP_TMP:-0}" = "1" ]; then
    note "sandboxes kept:${SANDBOXES}"
    return 0
  fi
  local s
  for s in ${SANDBOXES}; do rm -rf "${s}"; done
}
trap cleanup EXIT

test_noop_tick
test_api_deploy
test_manifest_triggers_install
test_docs_only_sync
test_build_failure_restores_and_backs_off
test_interrupted_deploy_resumes
test_local_commits_block
test_dead_lock_reclaimed
test_restart_failure_rolls_back_from_snapshot
test_ci_pending_defers_then_times_out
test_untracked_state_survives

note ""
if [ "${FAILS}" -gt 0 ]; then
  note "${FAILS} assertion(s) failed across ${TESTS} scenarios"
  exit 1
fi
note "all ${TESTS} scenarios passed"
exit 0
