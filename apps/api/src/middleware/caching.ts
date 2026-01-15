import { Request, Response, NextFunction } from 'express';

/**
 * Cache configuration for different API endpoints
 * Values are max-age in seconds
 */
const CACHE_CONFIG: Record<string, number> = {
  '/api/stats': 10,           // Stats change frequently - 10 seconds
  '/api/agents': 30,          // Agent list is relatively stable - 30 seconds
  '/api/activity': 15,        // Activity feed updates often - 15 seconds
  '/api/issues': 60,          // Issues don't change as often - 60 seconds
  '/api/proposals': 30,       // Proposals with voting status - 30 seconds
  '/api/signals': 30,         // Collected signals - 30 seconds
  '/api/agora/sessions': 20,  // Active sessions - 20 seconds
  '/api/chatter': 15,         // Agent chatter - 15 seconds
  '/api/disclosure': 60,      // Disclosure logs - 60 seconds
  '/api/governance-os': 30,   // Governance OS data - 30 seconds
};

/**
 * Paths that should never be cached
 */
const NO_CACHE_PATHS = [
  '/api/auth',
  '/api/votes',
  '/api/delegation',
  '/health',
];

/**
 * Caching middleware that adds Cache-Control headers to GET/HEAD requests
 * based on the endpoint configuration.
 */
export function cacheMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply caching to GET and HEAD requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  // Use originalUrl to get the full path including query params
  const requestPath = req.originalUrl.split('?')[0];

  // Check if this path should never be cached
  for (const noCache of NO_CACHE_PATHS) {
    if (requestPath.startsWith(noCache)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return next();
    }
  }

  // Find matching cache config
  for (const [path, maxAge] of Object.entries(CACHE_CONFIG)) {
    if (requestPath.startsWith(path)) {
      res.setHeader('Cache-Control', `public, max-age=${maxAge}, must-revalidate`);
      res.setHeader('Vary', 'Accept-Encoding');
      return next();
    }
  }

  // Default: no caching for unspecified paths
  next();
}

/**
 * ETag support middleware for conditional requests
 * This helps with 304 Not Modified responses
 */
export function etagMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Enable weak ETags for JSON responses
  res.set('ETag', 'W/"' + Date.now().toString(36) + '"');
  next();
}
