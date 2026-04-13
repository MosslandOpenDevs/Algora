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
      cron_restart: '0 * * * *', // top of every hour
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        BACKUP_RETENTION_DAYS: '14',
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
