import { Router, type Request, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../db';
import { env } from '../../env';
import { ApiError } from '../../lib/errors';
import { defineJob } from '../../lib/jobs';
import { cityIds } from '../../reference';
import { queueRiskCheck } from '../risk/triggers';
import { isStaffEmail } from '../staff/service';
import { LIMITS, SharedStore } from '../../lib/rateLimit';
import { toApiUser } from './apiUser';
import { deleteAccount } from './deleteAccount';
import { exportAccount } from './exportAccount';
import { sendCode, useCode } from './codes';
import { burnPasswordCheck, hashPassword, passwordMatches } from './password';
import { currentUser, requireUser } from './requireUser';
import { accountFor, verifyIdToken } from './social';
import { issueToken } from './tokens';
import { LEGAL_VERSION } from '@/legal';
import { isCommonPassword } from '@/lib/commonPasswords';

// docs/API.md → Accounts & Authentication (email). Google / Apple sign-in,
// avatar, ID verification and the payment card come later.

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'invalid' }));
// S1.2: 8–200 characters, and not one of the passwords every attacker tries first.
const password = z
  .string()
  .min(8, 'at least 8 characters')
  .max(200)
  .refine(p => !isCommonPassword(p), 'too common: choose a password people can’t guess');
const name = z.string().trim().min(2, 'at least 2 characters').max(60);

// B15.8: sign-up means agreeing to the terms and privacy policy (the app shows them with links).
const acceptTerms = z.literal(true, { error: 'acceptTerms: agree to the Terms and the Privacy Policy' });
const signupBody = z.object({ name, email, password, code: z.unknown(), acceptTerms });
const loginBody = z.object({ email, password: z.string().max(200) });
const emailBody = z.object({ email });
const resetBody = z.object({ email, password, code: z.unknown() });
const profileBody = z.object({
  name: name.optional(),
  cityId: z
    .string()
    .refine(id => cityIds.has(id), 'an area id from GET /cities')
    .optional(),
});

async function session(userId: string, req: Request) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  queueRiskCheck(user.id); // a new account, or a phone other accounts used
  return { token: await issueToken(user.id, req), user: toApiUser(user, req) };
}

const emailTaken = () => new ApiError(409, 'EMAIL_TAKEN', 'Email already registered');

// Slow down password guessing and code spamming. Three fences, 15 minutes each:
// - IP + email, the tight one: people behind one mobile-carrier IP don't block each other;
// - the email alone: one account attacked from many addresses;
// - the IP alone: one address trying many accounts (generous: carriers share IPs).
const emailOf = (req: Request) => String(req.body?.email ?? '').trim().toLowerCase();
const limited = (name: string, limit: number) => {
  const common = {
    windowMs: 15 * 60_000,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) =>
      void res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' },
      }),
  };
  return [
    rateLimit({ ...common, limit, store: new SharedStore(`auth-${name}:ip-email`), keyGenerator: req => `${ipKeyGenerator(req.ip ?? '')}|${emailOf(req as Request)}` }),
    rateLimit({ ...common, limit: limit * 5 * env.RATE_LIMIT_MULTIPLIER, store: new SharedStore(`auth-${name}:email`), keyGenerator: req => emailOf(req as Request) }),
    rateLimit({ ...common, limit: 300 * env.RATE_LIMIT_MULTIPLIER, store: new SharedStore(`auth-${name}:ip`), keyGenerator: req => ipKeyGenerator(req.ip ?? '') }),
  ];
};

export const authRoutes = Router();

// Staff (couriers, admins) never sign up: an admin creates their account (BACKEND_PLAN B14).
const refuseStaff = (email: string) => {
  if (isStaffEmail(email))
    throw new ApiError(422, 'VALIDATION', 'This email is for Sahla staff: ask an admin for an account');
};

// S1.3: the same answer whether or not the email has an account, so nobody can use
// sign-up to find out who uses Sahla. The owner of that mailbox gets an email either
// way: a code, or "you already have an account" (no code that works).
authRoutes.post('/auth/send-otp', ...limited('send-otp', 5), async (req, res) => {
  const body = emailBody.parse(req.body);
  refuseStaff(body.email);
  const exists = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
  await sendCode(body.email, 'signup', { accountExists: !!exists });
  res.status(204).end();
});

authRoutes.post('/auth/signup', ...limited('signup', 10), async (req, res) => {
  const body = signupBody.parse(req.body);
  refuseStaff(body.email);
  // S1.3: the code comes first: only the mailbox's owner can ever see EMAIL_TAKEN.
  await useCode(body.email, 'signup', body.code);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw emailTaken();
  const user = await prisma.user
    .create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        method: 'email',
        termsVersion: LEGAL_VERSION,
        termsAcceptedAt: new Date(),
      },
    })
    .catch(error => {
      // Two sign-ups with the same email at the same moment.
      if (error?.code === 'P2002') throw emailTaken();
      throw error;
    });
  res.status(201).json(await session(user.id, req));
});

authRoutes.post('/auth/login', ...limited('login', 10), async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // S1.3: the same time for no account and for a Google / Apple account with no password.
  if (!user?.passwordHash) await burnPasswordCheck(body.password);
  if (!user || !(await passwordMatches(body.password, user.passwordHash)))
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  if (user.suspended) throw new ApiError(403, 'FORBIDDEN', 'This account is suspended');
  res.json(await session(user.id, req));
});

// Google / Apple: the app sends the ID token from the provider's SDK (social.ts).
// Apple gives the person's name only to the app, on the first sign-in: it may send it.
const socialBody = z.object({
  idToken: z.string().min(20).max(10_000),
  name: z.string().max(60).optional(),
  // B15.8: needed when this sign-in creates a new account.
  acceptTerms: z.boolean().optional(),
});
for (const provider of ['google', 'apple'] as const)
  authRoutes.post(`/auth/${provider}`, ...limited(provider, 20), async (req, res) => {
    const body = socialBody.parse(req.body);
    const user = await accountFor(await verifyIdToken(provider, body.idToken), body.name, body.acceptTerms === true);
    if (user.suspended) throw new ApiError(403, 'FORBIDDEN', 'This account is suspended');
    res.json(await session(user.id, req));
  });

// S1.3: 204 whether or not the account exists, at once: the email goes out after the
// answer, so neither the answer nor its timing (or an email outage) reveals an account.
authRoutes.post('/auth/forgot-password', ...limited('forgot-password', 5), async (req, res) => {
  const body = emailBody.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }))
    resetEmail.soon({ email: body.email }, `mail:reset:${body.email}`, 0);
  res.status(204).end();
});
// A job, so an email outage is tried again rather than lost.
const resetEmail = defineJob('resetEmail', ({ email }: { email: string }) => sendCode(email, 'reset'));

authRoutes.post('/auth/reset-password', ...limited('reset-password', 10), async (req, res) => {
  const body = resetBody.parse(req.body);
  await useCode(body.email, 'reset', body.code);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw new ApiError(422, 'INVALID_CODE', 'Wrong or expired code');
  // The old password may have leaked: end every other session.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.password) },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  res.json(await session(user.id, req));
});

authRoutes.post('/auth/logout', requireUser, async (_req, res) => {
  await prisma.session.delete({ where: { id: res.locals.sessionId } });
  res.status(204).end();
});

authRoutes.get('/me', requireUser, (req, res) => {
  res.json(toApiUser(currentUser(res.locals), req));
});

// B15.8: an existing account accepts the current terms (after they changed, or made before consent existed).
authRoutes.post('/me/terms', requireUser, async (req, res) => {
  const { version } = z.object({ version: z.literal(LEGAL_VERSION, { error: `version: the current one is ${LEGAL_VERSION}` }) }).parse(req.body);
  const user = await prisma.user.update({
    where: { id: currentUser(res.locals).id },
    data: { termsVersion: version, termsAcceptedAt: new Date() },
  });
  res.json(toApiUser(user, req));
});

authRoutes.patch('/me', requireUser, async (req, res) => {
  const body = profileBody.parse(req.body);
  const user = await prisma.user.update({
    where: { id: currentUser(res.locals).id },
    data: body,
  });
  res.json(toApiUser(user, req));
});

authRoutes.delete('/me', requireUser, async (_req, res) => {
  await deleteAccount(currentUser(res.locals));
  res.status(204).end();
});

// S8.4: a copy of everything Sahla holds about the person.
authRoutes.get('/me/export', requireUser, ...LIMITS.dataExport, async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await exportAccount(currentUser(res.locals), req));
});
