import type { Request, Response, NextFunction } from 'express';

function extractKey(req: Request): string | undefined {
  const headerKey = req.headers['x-admin-key'];
  if (typeof headerKey === 'string') return headerKey;

  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return undefined;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True when `provided` is the configured admin key.
 *
 * Shared with the Socket.IO handshake so both transports check one credential
 * the same way; sockets cannot use the Express middleware directly.
 * Returns false — never throws — when ADMIN_API_KEY is unset, so an
 * unconfigured server grants nothing.
 */
export function verifyAdminKey(provided: string | undefined): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !provided) return false;
  return timingSafeEqual(provided, adminKey);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ error: 'Admin API not configured. Set ADMIN_API_KEY.' });
    return;
  }
  if (!verifyAdminKey(extractKey(req))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// For write endpoints that require any authenticated caller (user OR admin).
// In production this should be replaced with wallet-signature-based auth
// tied to MOC token holdings; for now we accept either a valid session token
// (future) or the admin key so governance writes aren't open to the internet.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ error: 'Auth not configured. Set ADMIN_API_KEY.' });
    return;
  }
  const provided = extractKey(req);
  if (!provided || !timingSafeEqual(provided, adminKey)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
