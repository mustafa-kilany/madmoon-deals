import 'dotenv/config';
import { z } from 'zod';

// Settings from backend/.env (copy .env.example). The server refuses to start
// if one is missing, so a typo shows up now, not on the first request.
const optional = z
  .string()
  .optional()
  .transform(value => value?.trim() || undefined);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    PORT: z.coerce.number().int().positive().default(4000),
    // Behind a load balancer / proxy in production: how many (usually 1), so the user's IP
    // (rate limits, sessions) comes from X-Forwarded-For. 0 = straight to this server.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // fatal, error, warn, info, debug. Default: info (silent in tests).
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).optional(),
    // Production: the public address, e.g. https://api.sahla.jo (for file URLs).
    PUBLIC_URL: optional,
    // Signs the log-in tokens (JWT). Long and random; changing it signs everyone out.
    JWT_SECRET: z.string().min(32, 'at least 32 characters (npm run secret makes one)'),
    // How long a log-in lasts. docs/API.md: 30–90 days, no refresh tokens.
    SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(60),
    // Local testing only: this code is accepted for any email and nothing is
    // sent (the app's tests and demo use 123456). Never set in production.
    DEV_EMAIL_CODE: optional,
    // Staff (couriers, admins) have emails at this domain; public sign-up refuses it.
    STAFF_EMAIL_DOMAIN: z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'a domain like sahla.jo')
      .default('sahla.jo'),
    // Google / Apple sign-in (BACKEND_PLAN B10): the app's client ids, comma-separated.
    // Google: the OAuth client ids (Android, iOS, web) from Google Cloud Console.
    // Apple: the app's bundle id (and a Services ID if there's a web sign-in).
    // Blank = that sign-in is off (503).
    GOOGLE_CLIENT_IDS: optional,
    APPLE_CLIENT_IDS: optional,
    // Tests only: where to fetch the providers' public keys.
    GOOGLE_JWKS_URL: z.string().url().default('https://www.googleapis.com/oauth2/v3/certs'),
    APPLE_JWKS_URL: z.string().url().default('https://appleid.apple.com/auth/keys'),
    // ID verification with Sanad (backend/docs/ID-VERIFICATION.md). off = 503 SANAD_UNAVAILABLE
    // until MoDEE gives Sahla access; fake = a pretend Sanad for development and tests.
    SANAD_MODE: z.enum(['off', 'fake']).default('off'),
    // Key for hashing national ID numbers (one ID, one verified account). Set it before
    // Sanad goes live and never change it; until then the JWT secret is used.
    ID_HASH_SECRET: z.string().min(32).optional(),
    // Card payments (BACKEND_PLAN B7, decision D2). off = 503 until the real provider is
    // added; fake = a pretend provider for development and tests (backend/docs/PAYMENTS.md).
    PAYMENT_MODE: z.enum(['off', 'fake']).default('off'),
    // Street from GPS at checkout (BACKEND_PLAN B7.1, decision D6). off = the app fills only the
    // area; fake = the nearest area's main street; nominatim = OpenStreetMap (NOMINATIM_URL).
    GEOCODER: z.enum(['off', 'fake', 'nominatim']).default('off'),
    NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
    // Push notifications (BACKEND_PLAN B9.3, backend/docs/PUSH.md). off = none sent; fake = recorded
    // for tests; fcm = Firebase Cloud Messaging with FIREBASE_SERVICE_ACCOUNT.
    PUSH_MODE: z.enum(['off', 'fake', 'fcm']).default('off'),
    // The Firebase service account key: a file path (e.g. ./firebase-service-account.json) or
    // the JSON itself (hosting with no files). A secret: never commit it.
    FIREBASE_SERVICE_ACCOUNT: optional,
    // Optional until those features are switched on (backend/docs/); blank = off.
    GOOGLE_VISION_API_KEY: optional, // certificate OCR
    ANTHROPIC_API_KEY: optional, // AI reviewer for the risk queue
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.DEV_EMAIL_CODE), {
    message: 'DEV_EMAIL_CODE must not be set in production',
    path: ['DEV_EMAIL_CODE'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.SANAD_MODE === 'fake'), {
    message: 'SANAD_MODE=fake must not be used in production',
    path: ['SANAD_MODE'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.PAYMENT_MODE === 'fake'), {
    message: 'PAYMENT_MODE=fake must not be used in production',
    path: ['PAYMENT_MODE'],
  })
  .refine(e => e.PUSH_MODE !== 'fcm' || e.FIREBASE_SERVICE_ACCOUNT, {
    message: 'PUSH_MODE=fcm needs FIREBASE_SERVICE_ACCOUNT',
    path: ['FIREBASE_SERVICE_ACCOUNT'],
  })
  .refine(
    e =>
      e.NODE_ENV !== 'production' ||
      (e.GOOGLE_JWKS_URL.startsWith('https://www.googleapis.com/') &&
        e.APPLE_JWKS_URL.startsWith('https://appleid.apple.com/')),
    { message: 'the JWKS URLs can only be changed outside production', path: ['GOOGLE_JWKS_URL'] },
  );

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid backend/.env:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
