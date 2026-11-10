import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type IncrementResponse, type Options, type Store } from 'express-rate-limit';
import { prisma } from '../db';
import { env } from '../env';
import { logger } from './logger';

// Rate limits for signed-in endpoints (SECURITY_PLAN S0.1–S0.2): per user, and
// per IP as a second fence (one person, many accounts).

/**
 * S0.9: counts kept in the database, so every server counts together (in memory, two servers would
 * allow 10 card tries an hour instead of 5). `name` must be unique per limit: it starts each key.
 * A fixed window per key, like express-rate-limit's own memory store. Only the API's flood fence
 * (app.ts) stays in memory: it is far above any person, and counting every request here would cost
 * a write per request.
 */
export class SharedStore implements Store {
  localKeys = false;
  private windowMs = 60_000;

  constructor(readonly name: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  // Keys carry emails, addresses and user ids: only a hash of them is stored (S1.9, nothing personal left behind).
  private key = (key: string) => `${this.name}:${createHash('sha256').update(key).digest('base64url').slice(0, 32)}`;

  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const [row] = await prisma.$queryRaw<{ hits: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "hits", "resetAt") VALUES (${this.key(key)}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."hits" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "hits", "resetAt"`;
    return { totalHits: row.hits, resetTime: row.resetAt };
  }

  async decrement(key: string) {
    await prisma.$executeRaw`UPDATE "RateLimit" SET "hits" = GREATEST("hits" - 1, 0) WHERE "key" = ${this.key(key)}`;
  }

  async resetKey(key: string) {
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${this.key(key)}`;
  }
}

// Finished windows, so the table only holds what's counting now.
const sweep = setInterval(() => {
  prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < ${new Date()}`.catch(error =>
    logger.warn({ err: error }, 'Rate limits: couldn’t clear old counts'),
  );
}, 10 * 60_000);
(sweep as unknown as { unref(): void }).unref();

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
    rateLimit({ ...common, limit: limit * env.RATE_LIMIT_MULTIPLIER, store: new SharedStore(`${name}:u`), keyGenerator: (_req, res) => res.locals.user?.id ?? 'anon' }),
    rateLimit({ ...common, limit: ipLimit * env.RATE_LIMIT_MULTIPLIER, store: new SharedStore(`${name}:ip`), keyGenerator: req => ipKeyGenerator(req.ip ?? '') }),
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
  chatRead: perUser('chat-read', { limit: 600, minutes: 10, message: 'Too many requests: wait a few minutes' }),
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
