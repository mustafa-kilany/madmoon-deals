import { z } from 'zod';
import { prisma } from '../../db';
import { env } from '../../env';
import { ApiError } from '../../lib/errors';
import { sendCode } from '../auth/codes';

// Staff accounts (couriers now, admins with the dashboard). Nobody signs up as
// staff: an admin creates the account with a company email, and the person
// sets a password with the emailed code (the app's normal reset screens).

export const isStaffEmail = (email: string) =>
  email.toLowerCase().endsWith(`@${env.STAFF_EMAIL_DOMAIN}`);

const courierInput = z.object({
  name: z.string().trim().min(2, 'at least 2 characters').max(60),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'invalid' }))
    .refine(isStaffEmail, `must end in @${env.STAFF_EMAIL_DOMAIN}`),
});

/** Creates a courier (or makes an existing staff account one) and emails the invite code. */
export async function createCourier(input: { name: string; email: string }) {
  const { name, email } = courierInput.parse(input);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role === 'courier')
    throw new ApiError(409, 'EMAIL_TAKEN', `${email} is already a courier`);
  const courier = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { role: 'courier' } })
    : await prisma.user.create({
        data: { name, email, method: 'email', verified: true, role: 'courier' },
      });
  await sendCode(email, 'reset'); // the invite: they choose a password with it
  return courier;
}

/** An admin for the dashboard. Same invite as couriers; the first dashboard log-in sets up 2FA (B8.1). */
export async function createAdmin(input: { name: string; email: string }) {
  const { name, email } = courierInput.parse(input);
  const existing = await prisma.user.findUnique({ where: { email } });
  const admin = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } })
    : await prisma.user.create({ data: { name, email, method: 'email', verified: true, role: 'admin' } });
  await sendCode(email, 'reset');
  return admin;
}

/**
 * An admin lost their authenticator app: their next dashboard log-in sets up a
 * new one. Their dashboard sessions end now.
 */
export async function resetAdmin2fa(email: string) {
  const admin = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!admin || admin.role !== 'admin') throw new ApiError(404, 'NOT_FOUND', `No admin ${email}`);
  await prisma.$transaction([
    prisma.user.update({ where: { id: admin.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } }),
    prisma.session.deleteMany({ where: { userId: admin.id, scope: 'admin' } }),
  ]);
}

/** Stops a courier from signing in (their sessions end at once). */
export async function disableCourier(email: string) {
  const courier = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!courier || courier.role !== 'courier') throw new ApiError(404, 'NOT_FOUND', `No courier ${email}`);
  await prisma.$transaction([
    prisma.user.update({ where: { id: courier.id }, data: { suspended: true } }),
    prisma.session.deleteMany({ where: { userId: courier.id } }),
  ]);
}
