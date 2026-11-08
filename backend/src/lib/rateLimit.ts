import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../env';

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
export function perUser(name: string, { limit, minutes, ipLimit = limit * 3, message, onlySuccessful = false }: {
  limit: number;
  minutes: number;
  ipLimit?: number;
  message: string;
  /** Count only requests that succeed (creating things), not refused ones. */
  onlySuccessful?: boolean;
}): RequestHandler[] {
  const windowMs = minutes * 60_000;
  const common = {
    windowMs,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    skipFailedRequests: onlySuccessful,
    handler: tooMany(message),
  };
  return [
    rateLimit({ ...common, limit: limit * env.RATE_LIMIT_MULTIPLIER, keyGenerator: (_req, res) => `${name}:u:${res.locals.user?.id ?? 'anon'}` }),
    rateLimit({ ...common, limit: ipLimit * env.RATE_LIMIT_MULTIPLIER, keyGenerator: req => `${name}:ip:${ipKeyGenerator(req.ip ?? '')}` }),
  ];
}

const HOUR = 60;
const DAY = 24 * HOUR;

/**
 * The budgets (SECURITY_PLAN S0.1–S0.2). Card attempts count every try (card
 * testing is many declined tries); creating things counts only successes.
 */
export const LIMITS = {
  // S0.1: card testing. 5 card tries an hour per person, 20 per IP.
  pay: perUser('pay', { limit: 5, minutes: HOUR, ipLimit: 20, message: 'Too many payment attempts: try again in an hour' }),
  card: perUser('card', { limit: 5, minutes: HOUR, ipLimit: 20, message: 'Too many card attempts: try again in an hour' }),
  // S0.2: paid services (Google Vision reads each certificate photo).
  certificate: perUser('certificate', { limit: 10, minutes: DAY, message: 'Too many certificate checks today' }),
  listingPhoto: perUser('listing-photo', { limit: 60, minutes: HOUR, message: 'Too many photos: try again later' }),
  avatar: perUser('avatar', { limit: 10, minutes: HOUR, message: 'Too many profile pictures: try again later' }),
  // S0.2: spam.
  chatMessage: perUser('chat', { limit: 60, minutes: 10, message: 'Too many messages: wait a few minutes' }),
  offer: perUser('offer', { limit: 20, minutes: HOUR, message: 'Too many offers: try again later' }),
  bid: perUser('bid', { limit: 60, minutes: HOUR, message: 'Too many bids: try again later' }),
  report: perUser('report', { limit: 20, minutes: DAY, message: 'Too many reports today' }),
  listing: perUser('listing', { limit: 20, minutes: DAY, onlySuccessful: true, message: 'Too many new listings today' }),
  // S8.4: a copy of the person's data is a heavy query, and rarely needed.
  dataExport: perUser('data-export', { limit: 5, minutes: DAY, message: 'Too many copies today: try again tomorrow' }),
  // S3.7: guessing the password through the bank account form.
  payoutAccount: perUser('payout-account', { limit: 5, minutes: HOUR, message: 'Too many tries: try again in an hour' }),
  order: perUser('order', { limit: 30, minutes: HOUR, message: 'Too many checkouts: try again later' }),
};
