import { env } from '../../env';
import { fakePayments } from './fake';

// The payment provider (BACKEND_PLAN B7.3, decision D2: MEPS, a bank's gateway,
// HyperPay, PayTabs, …). Card numbers never reach Sahla: the app's provider SDK
// turns the card into a token, and only the token comes here.
//
// Escrow means Sahla takes the buyer's money when they pay and keeps it until
// the courier confirms delivery (then a Payout to the seller), or refunds it.

export type ChargeResult = {
  /** The provider's payment id (Payment.providerRef). */
  ref: string;
  /** requires_action: the bank wants its card check (3-D Secure) first, at paymentUrl. */
  status: 'succeeded' | 'failed' | 'requires_action';
  paymentUrl?: string;
  /** What to keep for disputes (never card numbers). */
  data?: Record<string, string>;
};

export type SavedCard = { token: string; brand: string; last4: string };

export interface PaymentProvider {
  readonly name: string;
  /**
   * Takes `amountFils` from the card. `returnUrl` is where the bank's card check
   * sends the buyer's browser afterwards (our callback).
   */
  charge(input: { cardToken: string; amountFils: number; orderId: string; returnUrl: string }): Promise<ChargeResult>;
  /** The payment's current state, asked server to server (never trust the browser's redirect). */
  status(ref: string): Promise<ChargeResult>;
  /** Gives the money back (or cancels it, if the bank hasn't settled it yet). */
  refund(ref: string, amountFils: number): Promise<void>;
  /** The SDK's one-time token → a token that can be charged again ("saved" card). */
  saveCard(cardToken: string): Promise<SavedCard>;
  /** Forget a saved card at the provider. */
  deleteCard(token: string): Promise<void>;
}

/**
 * The provider in use, or null while payments are off (503). PAYMENT_MODE=fake
 * for development and tests; the real one is B7.9, once D2 is decided and Sahla
 * has a merchant account.
 */
export function paymentProvider(): PaymentProvider | null {
  return env.PAYMENT_MODE === 'fake' ? fakePayments : null;
}
