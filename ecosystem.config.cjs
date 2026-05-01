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
  ],
};
