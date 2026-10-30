import 'dotenv/config';
import { z } from 'zod';

// Settings from backend/.env (copy .env.example). The server refuses to start
// if one is missing, so a typo shows up now, not on the first request.
const optional = z
  .string()
  .optional()
  .transform(value => value?.trim() || undefined);

const schema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Optional until those features are switched on (backend/docs/); blank = off.
  GOOGLE_VISION_API_KEY: optional, // certificate OCR
  ANTHROPIC_API_KEY: optional, // AI reviewer for the risk queue
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid backend/.env:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
