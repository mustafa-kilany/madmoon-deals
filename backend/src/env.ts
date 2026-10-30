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
    // Optional until those features are switched on (backend/docs/); blank = off.
    GOOGLE_VISION_API_KEY: optional, // certificate OCR
    ANTHROPIC_API_KEY: optional, // AI reviewer for the risk queue
  })
  .refine(e => !(e.NODE_ENV === 'production' && e.DEV_EMAIL_CODE), {
    message: 'DEV_EMAIL_CODE must not be set in production',
    path: ['DEV_EMAIL_CODE'],
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid backend/.env:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
