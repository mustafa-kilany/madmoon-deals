import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../db';
import { env } from '../../env';
import { ApiError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { codeEmail, mailer, MailerUnavailable } from './mailer';

// 6-digit emailed codes (sign-up, password reset), docs/API.md → POST /auth/send-otp:
// valid 10 minutes, 5 wrong tries, at most one new code a minute per email.
// Stored as an HMAC, so a leaked database doesn't reveal live codes.

type Purpose = 'signup' | 'reset';

const VALID_MS = 10 * 60_000;
const RESEND_MS = 60_000;
const MAX_TRIES = 5;

const hmac = (email: string, purpose: Purpose, code: string) =>
  createHmac('sha256', env.JWT_SECRET).update(`${purpose}:${email}:${code}`).digest();

export async function sendCode(email: string, purpose: Purpose) {
  const recent = await prisma.emailCode.findFirst({
    where: { email, purpose, createdAt: { gt: new Date(Date.now() - RESEND_MS) } },
  });
  if (recent) return; // the code sent under a minute ago still works

  const code = env.DEV_EMAIL_CODE ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = await prisma.emailCode.create({
    data: {
      email,
      purpose,
      codeHash: hmac(email, purpose, code).toString('hex'),
      expiresAt: new Date(Date.now() + VALID_MS),
    },
  });
  if (env.DEV_EMAIL_CODE) return; // local testing: nothing is sent
  try {
    await mailer.send({ to: email, ...codeEmail(purpose, code) });
  } catch (error) {
    if (!(error instanceof MailerUnavailable)) throw error;
    // Not sent: forget the code so "send again" works at once, not after the minute.
    await prisma.emailCode.delete({ where: { id: row.id } });
    logger.error({ err: error }, 'Email code not sent');
    throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'Emails can’t be sent right now: try again in a few minutes');
  }
}

const invalid = () => new ApiError(422, 'INVALID_CODE', 'Wrong or expired code');

/** Throws INVALID_CODE unless `code` is the latest live code for this email; uses it up. */
export async function useCode(email: string, purpose: Purpose, code: unknown) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw invalid();
  if (env.DEV_EMAIL_CODE && code === env.DEV_EMAIL_CODE) {
    await prisma.emailCode.deleteMany({ where: { email, purpose } });
    return;
  }

  const latest = await prisma.emailCode.findFirst({
    where: { email, purpose, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest || latest.attempts >= MAX_TRIES) throw invalid();

  const expected = Buffer.from(latest.codeHash, 'hex');
  if (!timingSafeEqual(hmac(email, purpose, code), expected)) {
    await prisma.emailCode.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
    });
    throw invalid();
  }
  await prisma.emailCode.deleteMany({ where: { email, purpose } });
}
