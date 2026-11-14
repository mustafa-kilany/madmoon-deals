import 'dotenv/config';
import { z } from 'zod';

// Settings from backend/.env (copy .env.example). The server refuses to start
// if one is missing, so a typo shows up now, not on the first request.
const optional = z
  .string()
  .optional()
  .transform(value => value?.trim() || undefined);

/** Long, varied, and not a placeholder someone forgot to replace. */
const strongSecret = (value: string) =>
  value.length >= 32 && new Set(value).size >= 16 && !/secret|change|example|password|sahla|test/i.test(value);

/** A URL setting: a blank line in the host's settings means "not set", not "invalid". */
const optionalUrl = optional.pipe(z.url().optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    PORT: z.coerce.number().int().positive().default(4000),
    DB_POOL_SIZE: z.coerce.number().int().min(2).max(200).default(20),
    // Only if DATABASE_URL goes through a connection pooler: a direct address for hearing live bids (LISTEN).
    LIVE_DATABASE_URL: optional.pipe(z.string().startsWith('postgresql://').optional()),
    // Open live-auction connections per server: each takes about 220 KB of memory.
    LIVE_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(2000),
    // Behind a load balancer / proxy in production: how many (usually 1), so the user's IP
    // (rate limits, sessions) comes from X-Forwarded-For. 0 = straight to this server.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // fatal, error, warn, info, debug. Default: info (silent in tests).
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).optional(),
    // Production: the public address, e.g. https://api.sahla.jo (for file URLs).
    PUBLIC_URL: optional,
    // S0.8: the dashboard's address in production (e.g. https://admin.sahla.jo): the only website allowed
    // to call /v1/admin/* from a browser (CORS). Development uses Vite's proxy and needs none.
    ADMIN_ORIGIN: optionalUrl,
    // Signs the log-in tokens (JWT). Long and random; changing it signs everyone out.
    JWT_SECRET: z.string().min(32, 'at least 32 characters (npm run secret makes one)'),
    // How long a log-in lasts. docs/API.md: 30–90 days, no refresh tokens.
    SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(60),
    // Local testing only: this code is accepted for any email and nothing is
    // sent (the app's tests and demo use 123456). Never set in production.
    DEV_EMAIL_CODE: optional,
    // Emails (BACKEND_PLAN B9.1, backend/docs/EMAIL.md). console = printed in this terminal;
    // postmark = sent with Postmark (POSTMARK_SERVER_TOKEN, a secret: never commit it).
    MAIL_MODE: z.enum(['console', 'postmark']).default('console'),
    POSTMARK_SERVER_TOKEN: optional,
    // The sender: an address at a domain verified in Postmark.
    MAIL_FROM: z.string().min(3).default('Madmoon Deals <no-reply@sahla.jo>'),
    // Uploaded files (SECURITY_PLAN S0.5, backend/docs/STORAGE.md). local = backend/uploads, development only;
    // s3 = any S3-compatible service (Cloudflare R2, AWS S3, MinIO).
    STORAGE: z.enum(['local', 's3']).default('local'),
    S3_ENDPOINT: optionalUrl,
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,
    S3_PUBLIC_BUCKET: optional,
    S3_PRIVATE_BUCKET: optional,
    // The public bucket's web address, no trailing slash (e.g. https://files.sahla.jo).
    FILES_PUBLIC_URL: optionalUrl.transform(url => url?.replace(/\/$/, '')),
    // Error reports (SECURITY_PLAN S0.10). Blank = off. Reports are scrubbed: lib/errorReporter.ts.
    SENTRY_DSN: optionalUrl,
    // M3: the oldest app build (Android versionCode) still allowed. The app sends its own in X-App-Build;
    // an older one is told to update (426 UPDATE_REQUIRED). Blank = every build is allowed.
    MIN_APP_BUILD: optional.transform(value => (value === undefined ? undefined : Number(value))).pipe(z.number().int().positive().optional()),
    // Tests only: multiplies the per-user rate limits (src/lib/rateLimit.ts). Always 1 in production.
    RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),
    // B15.6: where people can write to Madmoon Deals' support team (shown in the app next to the support chat).
    SUPPORT_EMAIL: z.email().default('support@sahla.jo'),
    // The dashboard's second log-in step, the authenticator app code (BACKEND_PLAN B8.1).
    // off = email + password only: local development until the dashboard is hosted (B8.6).
    // Never off in production (the server refuses to start).
    ADMIN_2FA: z.enum(['on', 'off']).default('on'),
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
    // until MoDEE gives Madmoon Deals access; fake = a pretend Sanad for development and tests.
    SANAD_MODE: z.enum(['off', 'fake']).default('off'),
    // Key for hashing national ID numbers (one ID, one verified account). Set it before
    // Sanad goes live and never change it; until then the JWT secret is used.
    ID_HASH_SECRET: z.string().min(32).optional(),
    // Card payments (BACKEND_PLAN B7, decision D2). off = 503 until the real provider is
    // added; fake = a pretend provider for development and tests (backend/docs/PAYMENTS.md).
    PAYMENT_MODE: z.enum(['off', 'fake']).default('off'),
    // Street from GPS at checkout (BACKEND_PLAN B7.1, decision D6). off = the app fills only the
    // area; fake = the nearest area's main street; nominatim = OpenStreetMap (NOMINATIM_URL);
    // google = Google Geocoding API (GOOGLE_MAPS_API_KEY, paid; backend/docs/GEOCODING.md).
    GEOCODER: z.enum(['off', 'fake', 'nominatim', 'google']).default('off'),
    NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
    // A secret: never commit it. Restrict it to the Geocoding API in Google Cloud Console.
    GOOGLE_MAPS_API_KEY: optional,
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
  // S1.1: a secret an attacker could guess signs anyone's log-in. npm run secret makes good ones.
  .refine(e => e.NODE_ENV !== 'production' || strongSecret(e.JWT_SECRET), {
    message: 'JWT_SECRET looks made up: use npm run secret',
    path: ['JWT_SECRET'],
  })
  // S1.1: without it national IDs, serial numbers and IBANs would depend on JWT_SECRET, which a
  // leak forces you to change (and this one must never change).
  .refine(e => e.NODE_ENV !== 'production' || (!!e.ID_HASH_SECRET && strongSecret(e.ID_HASH_SECRET) && e.ID_HASH_SECRET !== e.JWT_SECRET), {
    message: 'ID_HASH_SECRET is required in production, different from JWT_SECRET (npm run secret); back it up: it never changes',
    path: ['ID_HASH_SECRET'],
  })
  // S0.5: on most hosts the disk is wiped on every deploy, with the photos and certificates on it.
  .refine(e => !(e.NODE_ENV === 'production' && e.STORAGE !== 's3'), {
    message: 'STORAGE=s3 is required in production (backend/docs/STORAGE.md)',
    path: ['STORAGE'],
  })
  .refine(e => e.STORAGE !== 's3' || (e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY && e.S3_PUBLIC_BUCKET && e.S3_PRIVATE_BUCKET && e.FILES_PUBLIC_URL), {
    message: 'STORAGE=s3 needs S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BUCKET, S3_PRIVATE_BUCKET and FILES_PUBLIC_URL',
    path: ['S3_ENDPOINT'],
  })
  .refine(e => !e.S3_PUBLIC_BUCKET || e.S3_PUBLIC_BUCKET !== e.S3_PRIVATE_BUCKET, {
    message: 'The certificate originals need their own private bucket',
    path: ['S3_PRIVATE_BUCKET'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.FILES_PUBLIC_URL && !e.FILES_PUBLIC_URL.startsWith('https://')), {
    message: 'FILES_PUBLIC_URL must be https in production',
    path: ['FILES_PUBLIC_URL'],
  })
  // S0.4: without it, file URLs would be built from the request's Host header, which a client controls.
  .refine(e => !(e.NODE_ENV === 'production' && !e.PUBLIC_URL?.startsWith('https://')), {
    message: 'PUBLIC_URL (https://…) is required in production',
    path: ['PUBLIC_URL'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.DEV_EMAIL_CODE), {
    message: 'DEV_EMAIL_CODE must not be set in production',
    path: ['DEV_EMAIL_CODE'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.ADMIN_2FA === 'off'), {
    message: 'ADMIN_2FA=off must not be used in production: admins need the authenticator code',
    path: ['ADMIN_2FA'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.RATE_LIMIT_MULTIPLIER !== 1), {
    message: 'RATE_LIMIT_MULTIPLIER is for tests only',
    path: ['RATE_LIMIT_MULTIPLIER'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.SANAD_MODE === 'fake'), {
    message: 'SANAD_MODE=fake must not be used in production',
    path: ['SANAD_MODE'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.PAYMENT_MODE === 'fake'), {
    message: 'PAYMENT_MODE=fake must not be used in production',
    path: ['PAYMENT_MODE'],
  })
  .refine(e => e.MAIL_MODE !== 'postmark' || e.POSTMARK_SERVER_TOKEN, {
    message: 'MAIL_MODE=postmark needs POSTMARK_SERVER_TOKEN',
    path: ['POSTMARK_SERVER_TOKEN'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.MAIL_MODE === 'console'), {
    message: 'MAIL_MODE=console must not be used in production: nobody would get their codes',
    path: ['MAIL_MODE'],
  })
  .refine(e => e.GEOCODER !== 'google' || e.GOOGLE_MAPS_API_KEY, {
    message: 'GEOCODER=google needs GOOGLE_MAPS_API_KEY',
    path: ['GOOGLE_MAPS_API_KEY'],
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.GEOCODER === 'fake'), {
    message: 'GEOCODER=fake must not be used in production',
    path: ['GEOCODER'],
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
