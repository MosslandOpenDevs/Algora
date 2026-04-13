import rateLimit from 'express-rate-limit';

// Global default: 300 requests / minute per IP for read-heavy dashboards.
// Write/LLM endpoints should layer stricter limits on top of this.
export const globalLimiter: ReturnType<typeof rateLimit> = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

// Strict limit for state-changing governance endpoints (proposals, votes,
// delegation, governance-os writes). 20 writes / minute / IP is generous
// for real users but blocks automated voting/spam bursts.
export const writeLimiter: ReturnType<typeof rateLimit> = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests. Please wait before retrying.' },
});

// Very strict limit for LLM-invoking endpoints — each call costs tokens,
// so cap at 10/min/IP to prevent bill-draining loops.
export const llmLimiter: ReturnType<typeof rateLimit> = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'LLM rate limit exceeded. Please wait.' },
});
