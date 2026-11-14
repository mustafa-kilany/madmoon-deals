import { isJordanIban, normalizeIban } from '@/lib/iban';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import type { User } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { defineJob } from '../../lib/jobs';
import { LIMITS } from '../../lib/rateLimit';
import { dataSeal, dataUnseal } from '../../lib/sealed';
import { sendCode, useCode } from '../auth/codes';
import { mailer, payoutAccountEmail } from '../auth/mailer';
import { passwordMatches } from '../auth/password';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { pushPayoutAccountChanged } from '../notifications/notify';

// SECURITY_PLAN S3.7: where a seller's money goes. Changing the IBAN just before a
// payout is the classic fraud after an account take-over, so: the password (or an
// emailed code, for Google / Apple accounts) is needed every time; the person gets a
// push and an email; and after a change nothing is sent for 24 hours. Only the last 4
// characters ever come back to the app. The IBAN is encrypted in the database.

export const PAYOUT_HOLD_MS = 24 * 3_600_000;

/** Until when payouts wait after the account changed, while that is still ahead. */
export function payoutHeldUntil(user: Pick<User, 'payoutChangedAt'>, now = Date.now()) {
  const until = user.payoutChangedAt ? user.payoutChangedAt.getTime() + PAYOUT_HOLD_MS : 0;
  return until > now ? new Date(until) : undefined;
}

/** For the finance page: the full IBAN, or undefined if there is none or it can't be read. */
export function payoutAccountOf(user: Pick<User, 'payoutHolder' | 'payoutIban' | 'payoutChangedAt'>) {
  const iban = user.payoutIban ? dataUnseal(user.payoutIban) : undefined;
  if (!iban || !user.payoutHolder) return undefined;
  const heldUntil = payoutHeldUntil(user);
  return { holderName: user.payoutHolder, iban, ...(heldUntil && { heldUntil: heldUntil.toISOString() }) };
}

const toApi = (user: User) => ({
  // How the app must confirm a change: the password, or an emailed code (Google / Apple accounts).
  confirmWith: user.passwordHash ? ('password' as const) : ('code' as const),
  account:
    user.payoutIban && user.payoutIbanLast4 && user.payoutHolder
      ? {
          holderName: user.payoutHolder,
          ibanLast4: user.payoutIbanLast4,
          ...(payoutHeldUntil(user) && { heldUntil: payoutHeldUntil(user)!.toISOString() }),
        }
      : null,
});

const accountBody = z.object({
  holderName: z.string().trim().min(3, 'at least 3 characters').max(100),
  iban: z
    .string()
    .max(60)
    .transform(normalizeIban)
    .refine(isJordanIban, { error: 'iban: a Jordanian IBAN: JO and 28 more letters and numbers' }),
  password: z.string().max(200).optional(),
  code: z.unknown().optional(),
});

/** Is this really the account's owner, right now? (A stolen phone that is already signed in isn't enough.) */
async function confirmOwner(user: User, input: { password?: string; code?: unknown }) {
  if (user.passwordHash) {
    if (!(await passwordMatches(input.password ?? '', user.passwordHash)))
      throw new ApiError(422, 'INVALID_CREDENTIALS', 'Wrong password');
    return;
  }
  if (!user.email) throw new ApiError(422, 'VALIDATION', 'This account has no email: contact Madmoon Deals support');
  await useCode(user.email, 'payout', input.code);
}

export const payoutAccountRoutes = Router();

payoutAccountRoutes.get('/me/payout-account', ...requireCustomer, (_req, res) => {
  res.json(toApi(currentUser(res.locals)));
});

/** Accounts with no password (Google / Apple) ask for a code first. */
payoutAccountRoutes.post('/me/payout-account/code', ...requireCustomer, ...LIMITS.payoutAccount, async (_req, res) => {
  const user = currentUser(res.locals);
  if (user.passwordHash) throw new ApiError(422, 'VALIDATION', 'This account confirms with its password');
  if (!user.email) throw new ApiError(422, 'VALIDATION', 'This account has no email: contact Madmoon Deals support');
  await sendCode(user.email, 'payout');
  res.status(204).end();
});

payoutAccountRoutes.put('/me/payout-account', ...requireCustomer, ...LIMITS.payoutAccount, async (req, res) => {
  const me = currentUser(res.locals);
  const input = accountBody.parse(req.body);
  await confirmOwner(me, input);
  const replaced = !!me.payoutIban;
  const last4 = input.iban.slice(-4);
  const user = await prisma.user.update({
    where: { id: me.id },
    data: {
      payoutHolder: input.holderName,
      payoutIban: dataSeal(input.iban),
      payoutIbanLast4: last4,
      // The first account has nothing to protect yet; replacing one starts the 24 hours.
      ...(replaced && { payoutChangedAt: new Date() }),
    },
  });
  pushPayoutAccountChanged(me.id, last4);
  if (me.email) {
    const to = me.email;
    payoutAccountMail.soon({ to, last4, replaced }, `mail:payout:${me.id}`);
  }
  res.json(toApi(user));
});

// S3.7: the account's owner is told by email too, in case the change wasn't them. A job: tried again if email is down.
const payoutAccountMail = defineJob('payoutAccountMail', ({ to, last4, replaced }: { to: string; last4: string; replaced: boolean }) =>
  mailer.send({ to, ...payoutAccountEmail(last4, replaced) }),
);
