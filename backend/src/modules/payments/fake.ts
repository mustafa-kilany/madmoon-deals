import { randomBytes } from 'node:crypto';
import { ApiError } from '../../lib/errors';
import type { ChargeResult, PaymentProvider } from './provider';

// A pretend payment provider (PAYMENT_MODE=fake) for development and tests.
// Cards are the app's mock tokens "mock_<brand>_<last4>" (frontend
// src/services/payments) or saved ones "fakecard_<brand>_<last4>". Like the
// test cards of real providers, the last 4 digits choose what happens:
//   0002 → declined
//   3155 → needs the bank's card check: paymentUrl is a pretend bank page on
//          this server (GET /v1/payments/fake/bank/:ref) with Approve / Decline
//   anything else → paid straight away
// Payments live in memory: restarting the server forgets unfinished card checks.

export const DECLINED_LAST4 = '0002';
export const CARD_CHECK_LAST4 = '3155';

type FakePayment = { status: ChargeResult['status'] | 'refunded'; amountFils: number; returnUrl: string; last4: string };
const payments = new Map<string, FakePayment>();

const card = (token: string) => {
  const match = /^(?:mock|fakecard)_([a-z]+)_(\d{4})$/.exec(token);
  if (!match) throw new ApiError(422, 'VALIDATION', 'cardToken: unrecognised');
  return match;
};

const result = (ref: string, p: FakePayment, paymentUrl?: string): ChargeResult => ({
  ref,
  // A refunded payment had succeeded first.
  status: p.status === 'refunded' ? 'succeeded' : p.status,
  ...(paymentUrl && { paymentUrl }),
  data: { last4: p.last4 },
});

export const fakePayments: PaymentProvider & {
  /** The pretend bank page's buttons. */
  answerCardCheck(ref: string, approved: boolean): string | undefined;
  isRefunded(ref: string): boolean;
} = {
  name: 'fake',

  async charge({ cardToken, amountFils, returnUrl }) {
    const match = card(cardToken);
    const ref = `fake_pay_${randomBytes(9).toString('base64url')}`;
    const last4 = match[2];
    const status = last4 === DECLINED_LAST4 ? 'failed' : last4 === CARD_CHECK_LAST4 ? 'requires_action' : 'succeeded';
    const payment = { status, amountFils, returnUrl, last4 } as const;
    payments.set(ref, { ...payment });
    const bankPage = status === 'requires_action' ? `${new URL(returnUrl).origin}/v1/payments/fake/bank/${ref}` : undefined;
    return result(ref, payment, bankPage);
  },

  async status(ref) {
    const payment = payments.get(ref);
    if (!payment) throw new Error(`Unknown payment ${ref}`);
    return result(ref, payment);
  },

  async refund(ref) {
    const payment = payments.get(ref);
    if (!payment || (payment.status !== 'succeeded' && payment.status !== 'refunded'))
      throw new Error(`Payment ${ref} can't be refunded`);
    payment.status = 'refunded';
  },

  async saveCard(cardToken) {
    const match = card(cardToken);
    return { token: `fakecard_${match[1]}_${match[2]}`, brand: match[1], last4: match[2] };
  },

  async deleteCard() {},

  /** → where to send the browser next (our callback), or undefined if there's nothing to answer. */
  answerCardCheck(ref, approved) {
    const payment = payments.get(ref);
    if (!payment || payment.status !== 'requires_action') return undefined;
    payment.status = approved ? 'succeeded' : 'failed';
    return `${payment.returnUrl}?${new URLSearchParams({ ref })}`;
  },

  isRefunded: ref => payments.get(ref)?.status === 'refunded',
};
