import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

// Rate limits for signed-in endpoints (SECURITY_PLAN S0.1–S0.2): per user, and
// per IP as a second fence (one person, many accounts). Kept in memory: fine for
// one server; with several, move to a shared store (S0.9).

const tooMany = (message: string): RequestHandler => (_req, res) => {
  res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
};

/**
 * `limit` requests per `minutes` for each signed-in user (after requireUser),
 * and `ipLimit` (default 3 × limit) from one IP address.
 */
export function perUser(name: string, { limit, minutes, ipLimit = limit * 3, message }: {
  limit: number;
  minutes: number;
  ipLimit?: number;
  message: string;
}): RequestHandler[] {
  const windowMs = minutes * 60_000;
  const common = { windowMs, standardHeaders: 'draft-8' as const, legacyHeaders: false, handler: tooMany(message) };
  return [
    rateLimit({ ...common, limit, keyGenerator: (_req, res) => `${name}:u:${res.locals.user?.id ?? 'anon'}` }),
    rateLimit({ ...common, limit: ipLimit, keyGenerator: req => `${name}:ip:${ipKeyGenerator(req.ip ?? '')}` }),
  ];
}
