import { Router, type Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { cityIds } from '../../reference';
import { toApiUser } from './apiUser';
import { sendCode, useCode } from './codes';
import { burnPasswordCheck, hashPassword, passwordMatches } from './password';
import { currentUser, requireUser } from './requireUser';
import { issueToken } from './tokens';

// docs/API.md → Accounts & Authentication (email). Google / Apple sign-in,
// avatar, ID verification and the payment card come later.

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'invalid' }));
const password = z.string().min(8, 'at least 8 characters').max(200);
const name = z.string().trim().min(2, 'at least 2 characters').max(60);

const signupBody = z.object({ name, email, password, code: z.unknown() });
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
  return { token: await issueToken(user.id, req), user: toApiUser(user) };
}

const emailTaken = () => new ApiError(409, 'EMAIL_TAKEN', 'Email already registered');

// Slow down password guessing and code spamming. Counted per IP + email, so
// people behind one mobile-carrier IP don't block each other.
const limited = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req =>
      `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' },
      }),
  });

export const authRoutes = Router();

authRoutes.post('/auth/send-otp', limited(5), async (req, res) => {
  const body = emailBody.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw emailTaken();
  await sendCode(body.email, 'signup');
  res.status(204).end();
});

authRoutes.post('/auth/signup', limited(10), async (req, res) => {
  const body = signupBody.parse(req.body); // VALIDATION, then EMAIL_TAKEN, then the code
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw emailTaken();
  await useCode(body.email, 'signup', body.code);
  const user = await prisma.user
    .create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        method: 'email',
      },
    })
    .catch(error => {
      // Two sign-ups with the same email at the same moment.
      if (error?.code === 'P2002') throw emailTaken();
      throw error;
    });
  res.status(201).json(await session(user.id, req));
});

authRoutes.post('/auth/login', limited(10), async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) await burnPasswordCheck(body.password);
  if (!user || !(await passwordMatches(body.password, user.passwordHash)))
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  if (user.suspended) throw new ApiError(403, 'FORBIDDEN', 'This account is suspended');
  res.json(await session(user.id, req));
});

// 204 whether or not the account exists, so it can't be used to find accounts.
authRoutes.post('/auth/forgot-password', limited(5), async (req, res) => {
  const body = emailBody.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } }))
    await sendCode(body.email, 'reset');
  res.status(204).end();
});

authRoutes.post('/auth/reset-password', limited(10), async (req, res) => {
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

authRoutes.get('/me', requireUser, (_req, res) => {
  res.json(toApiUser(currentUser(res.locals)));
});

authRoutes.patch('/me', requireUser, async (req, res) => {
  const body = profileBody.parse(req.body);
  const user = await prisma.user.update({
    where: { id: currentUser(res.locals).id },
    data: body,
  });
  res.json(toApiUser(user));
});

authRoutes.delete('/me', requireUser, async (_req, res) => {
  const userId = currentUser(res.locals).id;
  // TODO(orders): 409 OPEN_ORDERS while an order is escrow_held with this user.
  // Listings are taken off sale and keep no link to the user (Listing.sellerUserId → null);
  // sessions, codes, certificates, reports and blocks go with the account.
  await prisma.$transaction([
    prisma.listing.updateMany({
      where: { sellerUserId: userId, status: 'active' },
      data: { status: 'withdrawn' },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  res.status(204).end();
});
