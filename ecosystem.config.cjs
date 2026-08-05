// Auto-deploy is opt-in per machine: the algora-deploy poller is only
// registered when ALGORA_AUTO_DEPLOY=1 is present in .env. Without that gate
// every checkout of this repo — a laptop, a staging clone — would start
// fast-forwarding itself to origin/main as soon as someone ran
// `pm2 start ecosystem.config.cjs`. Minimal .env read, no dotenv dep at root.
let AUTO_DEPLOY = false;
let ALERT_WEBHOOK = '';
let GITHUB_TOKEN = '';
try {
  const env = require('fs').readFileSync(`${__dirname}/.env`, 'utf8');
  AUTO_DEPLOY = /^ALGORA_AUTO_DEPLOY=1\s*$/m.test(env);
  // Same minimal .env read for the deploy-failure webhook, so configuring it
  // doesn't depend on whichever shell happens to run `pm2 start` (registration
  // captures env at that moment; an unexported var would silently disable
  // alerts — the deploy tripwire's webhook path relies on this).
  const webhook = env.match(/^DEPLOY_ALERT_WEBHOOK=(\S+)\s*$/m);
  if (webhook) ALERT_WEBHOOK = webhook[1];
  // And for the GitHub token, for the same reason but with sharper teeth: the
  // CI gate is fail-closed, so an unexported token does not merely lose alerts,
  // it exhausts the box's unauthenticated quota (the collectors share it), the
  // check status reads unavailable, and deploys stop. This app has no env_file,
  // so without this read there is nowhere to put the token but the shell.
  const token = env.match(/^GITHUB_TOKEN=(\S+)\s*$/m);
  if (token) GITHUB_TOKEN = token[1];
} catch {
  // no .env — auto-deploy stays off
}

// The token usually already exists for the GitHub signal collector, which reads
// it from apps/api/.env (algora-api runs with cwd ./apps/api, so both its
// env_file and dotenv resolve there) — while .env.example documents it at the
// repo root. Rather than make anyone keep the same secret in two files, fall
// back to the API's copy. Deliberately token-only: ALGORA_AUTO_DEPLOY stays a
// root-level, per-machine opt-in.
if (!GITHUB_TOKEN) {
  try {
    const apiEnv = require('fs').readFileSync(`${__dirname}/apps/api/.env`, 'utf8');
    const token = apiEnv.match(/^GITHUB_TOKEN=(\S+)\s*$/m);
    if (token) GITHUB_TOKEN = token[1];
  } catch {
    // no apps/api/.env — the gate will report the missing token via alert
  }
}

module.exports = {
  apps: [
    {
      name: 'algora-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3201,
        CORS_ORIGIN: 'https://algora.moss.land',
        // Force Ollama-only mode regardless of stale env in pm2's cache.
        // This wins because pm2's `env:` block is applied last when starting
        // the process — even if an old ANTHROPIC_API_KEY lingers, the LLM
        // service short-circuits Tier 2 when this flag is true.
        LLM_DISABLE_TIER2: 'true',
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
        GOOGLE_AI_API_KEY: '',
      },
      env_file: '.env',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      // Hourly SQLite online backup. pm2 runs the script on cron_restart
      // and autorestart:false keeps it as a one-shot. Add --verify in
      // production to catch silent corruption.
      name: 'algora-db-backup',
      cwd: './apps/api',
      script: 'node_modules/.bin/tsx',
      args: 'scripts/backup-db.ts --verify',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      // Every 6 hours instead of hourly. Inter-hour delta on this DB is a few
      // KB; an idle window doesn't justify a 100 MB compressed snapshot. The
      // dedupe check inside backup-db.ts further skips any unchanged window.
      cron_restart: '0 */6 * * *',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        BACKUP_HOURLY_RETENTION_DAYS: '2',
        BACKUP_DAILY_RETENTION_DAYS: '7',
        BACKUP_COMPRESS: 'true',
        BACKUP_DEDUPE: 'true',
      },
      error_file: './logs/backup-error.log',
      out_file: './logs/backup-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'algora-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3200',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3200,
        // Public URL for client-side requests (goes through nginx)
        NEXT_PUBLIC_API_URL: 'https://algora.moss.land',
        // Internal URL for server-side RSC requests (bypasses nginx, avoids circular requests)
        API_INTERNAL_URL: 'http://localhost:3201',
      },
      watch: false,
      max_memory_restart: '2G',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    // Pull-based auto-deploy poller (see scripts/deploy.sh for why pull-based).
    // One-shot on a cron tick, like algora-db-backup: a no-op unless
    // origin/main moved. Minutes are staggered off moss-ao-deploy's
    // :04/:09/... ticks since both repos share this box.
    ...(AUTO_DEPLOY ? [{
      name: 'algora-deploy',
      script: 'scripts/deploy.sh',
      interpreter: 'bash',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G', // headroom for `pnpm build`
      cron_restart: '1-59/5 * * * *',
      env: {
        NODE_ENV: 'production',
        DEPLOY_BRANCH: process.env.DEPLOY_BRANCH || 'main',
        // DEPLOY_REQUIRE_CI is deliberately NOT passed here. pm2 freezes env at
        // registration, so a value set here can only be changed by re-registering
        // the process — which is how a stale DEPLOY_REQUIRE_CI=0 would have kept
        // the CI gate off no matter what shipped. deploy.sh reads it from the
        // repo-root .env instead (defaulting to 1, fail-closed), so the setting
        // travels with the code.
        DEPLOY_ALERT_WEBHOOK: process.env.DEPLOY_ALERT_WEBHOOK || ALERT_WEBHOOK,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || GITHUB_TOKEN,
      },
      error_file: './logs/deploy-error.log',
      out_file: './logs/deploy-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    }] : []),
  ],
};
