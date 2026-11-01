import { Router, type Request, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { env } from '../../env';
import { seal, unseal } from '../../lib/sealed';
import { burnPasswordCheck, passwordMatches } from '../auth/password';
import { currentUser, requireAdmin } from '../auth/requireUser';
import { ADMIN_SESSION_HOURS, challengeSubject, issueToken, signChallenge, verifyChallenge } from '../auth/tokens';
import { logAdminAction } from './audit';
import { matchTotp, newTotpSecret, otpauthUrl } from './totp';

// docs/API.md → Admin dashboard → Log-in (BACKEND_PLAN B8.1). Two steps:
// password → a 5-minute ticket → a code from the admin's authenticator app →
// a dashboard token (12 hours). The first log-in also sets up the app: the
// answer carries the secret (and its QR link) until a code from it is accepted.

export const adminAuthRoutes = Router();

const tooMany = (_req: Request, res: Response) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' } });

// Per IP + email for passwords; per admin for codes (whatever IP they come from).
const passwordLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: req => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
  handler: tooMany,
});
const codeLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: req => challengeSubject(req.body?.challenge) ?? ipKeyGenerator(req.ip ?? ''),
  handler: tooMany,
});

const toApiAdmin = (u: { id: string; name: string; email: string | null }) => ({ id: u.id, name: u.name, email: u.email ?? '' });

const loginBody = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

adminAuthRoutes.post('/admin/auth/login', passwordLimit, async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) await burnPasswordCheck(body.password);
  if (!user || !(await passwordMatches(body.password, user.passwordHash)))
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  if (user.role !== 'admin' || user.suspended) throw new ApiError(403, 'FORBIDDEN', 'Admins only');

  // Development until the dashboard is hosted (ADMIN_2FA=off): the password is enough.
  if (env.ADMIN_2FA === 'off') {
    const token = await issueToken(user.id, req, 'admin');
    await logAdminAction(user.id, req, 'admin.login', undefined, { secondStep: 'off' });
    res.json({ token, expiresInHours: ADMIN_SESSION_HOURS, admin: toApiAdmin(user) });
    return;
  }

  let setup: { secret: string; otpauthUrl: string } | undefined;
  if (!user.totpEnabledAt) {
    // Not set up yet: keep the same secret across tries until a code from it works.
    let secret = user.totpSecret ? unseal(user.totpSecret) : undefined;
    if (!secret) {
      secret = newTotpSecret();
      await prisma.user.update({ where: { id: user.id }, data: { totpSecret: seal(secret), totpLastStep: null } });
    }
    setup = { secret, otpauthUrl: otpauthUrl(secret, user.email ?? user.name) };
  }
  res.json({ challenge: await signChallenge(user.id), ...(setup && { setup }) });
});

const verifyBody = z.object({ challenge: z.string().min(20).max(2000), code: z.string().trim().max(10) });

adminAuthRoutes.post('/admin/auth/verify', codeLimit, async (req, res) => {
  const body = verifyBody.parse(req.body);
  const wrongCode = () => new ApiError(422, 'INVALID_CODE', 'Wrong or expired code');
  const userId = await verifyChallenge(body.challenge);
  if (!userId) throw new ApiError(401, 'UNAUTHORIZED', 'The log-in took too long: start again');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'admin' || user.suspended) throw new ApiError(403, 'FORBIDDEN', 'Admins only');
  const secret = user.totpSecret && unseal(user.totpSecret);
  if (!secret) throw new ApiError(401, 'UNAUTHORIZED', 'Start the log-in again');
  const step = matchTotp(secret, body.code);
  if (step === undefined) throw wrongCode();
  // Each code works once: only a step after the last accepted one.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step, totpEnabledAt: user.totpEnabledAt ?? new Date() },
  });
  if (!count) throw wrongCode();
  const token = await issueToken(user.id, req, 'admin');
  await logAdminAction(user.id, req, user.totpEnabledAt ? 'admin.login' : 'admin.2fa_setup');
  res.json({ token, expiresInHours: ADMIN_SESSION_HOURS, admin: toApiAdmin(user) });
});

adminAuthRoutes.get('/admin/me', ...requireAdmin, (_req, res) => {
  res.json(toApiAdmin(currentUser(res.locals)));
});

adminAuthRoutes.post('/admin/auth/logout', ...requireAdmin, async (_req, res) => {
  await prisma.session.delete({ where: { id: res.locals.sessionId } });
  res.status(204).end();
});
