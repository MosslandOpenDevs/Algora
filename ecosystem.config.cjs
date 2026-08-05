// Auto-deploy is opt-in per machine: the algora-deploy poller is only
// registered when ALGORA_AUTO_DEPLOY=1 is present in .env. Without that gate
// every checkout of this repo — a laptop, a staging clone — would start
// fast-forwarding itself to origin/main as soon as someone ran
// `pm2 start ecosystem.config.cjs`. Minimal .env read, no dotenv dep at root.
let AUTO_DEPLOY = false;
try {
  const env = require('fs').readFileSync(`${__dirname}/.env`, 'utf8');
  AUTO_DEPLOY = /^ALGORA_AUTO_DEPLOY=1\s*$/m.test(env);
} catch {
  // no .env — auto-deploy stays off
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
        DEPLOY_REQUIRE_CI: process.env.DEPLOY_REQUIRE_CI || '0',
        DEPLOY_ALERT_WEBHOOK: process.env.DEPLOY_ALERT_WEBHOOK || '',
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
      },
      error_file: './logs/deploy-error.log',
      out_file: './logs/deploy-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    }] : []),
  ],
};
