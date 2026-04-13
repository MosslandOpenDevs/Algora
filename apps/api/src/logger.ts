import pino, { type Logger } from 'pino';

/**
 * Shared structured logger.
 *
 * Production: JSON to stdout (pm2 captures it; downstream log-aggregators
 * can parse it). Development: pretty-printed if `pino-pretty` is available,
 * otherwise JSON (we don't ship pino-pretty as a runtime dep).
 *
 * Redacts well-known secret-bearing fields so an errant log.info(req.body)
 * or log.error(err, { config }) can't leak an API key.
 */
export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-admin-key"]',
      'req.headers.cookie',
      '*.apiKey',
      '*.api_key',
      '*.ANTHROPIC_API_KEY',
      '*.OPENAI_API_KEY',
      '*.GOOGLE_AI_API_KEY',
      '*.ADMIN_API_KEY',
      '*.password',
      '*.secret',
    ],
    censor: '[redacted]',
  },
  base: {
    service: 'algora-api',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Child logger scoped to a subsystem. Use instead of top-level `logger` when
 *  you want a stable `module` field in every line — makes grepping easier. */
export function moduleLogger(name: string): Logger {
  return logger.child({ module: name });
}
