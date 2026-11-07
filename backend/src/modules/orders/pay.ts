import { randomInt } from 'node:crypto';
import { prisma } from '../../db';
import type { Payment } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { paymentProvider, type ChargeResult, type PaymentProvider } from '../payments/provider';
import { pushSold } from '../notifications/notify';
import { orderInclude } from './shapes';

// POST /orders/:id/pay and the bank's callback (BACKEND_PLAN B7.4). Paying
// takes the money (escrow), makes the delivery PIN and reserves the listing in
// one transaction with the listing row locked, so the first payment wins. A
// payment that loses the race (the listing was just bought) is refunded at once.

const unavailable = () => new ApiError(409, 'ITEM_UNAVAILABLE', 'Someone else just bought this');

export function provider(): PaymentProvider {
  const p = paymentProvider();
  if (!p) throw new ApiError(503, 'INTERNAL', 'Card payments aren’t switched on yet');
  return p;
}

const newPin = () => String(randomInt(0, 10_000)).padStart(4, '0');

/** paid: escrow held. already_paid: this order was paid by another attempt. sold: the listing went to someone else. */
type Outcome = 'paid' | 'already_paid' | 'sold';

/**
 * A succeeded payment → escrow, or a refund when it came too late. The payment,
 * order and listing rows are locked, so a payment is settled once even when the
 * bank calls back twice at the same moment.
 */
async function settle(payment: Payment, result: ChargeResult): Promise<Outcome> {
  const outcome = await prisma.$transaction(async tx => {
    const [current] = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    if (current.status === 'succeeded') return 'settled_paid' as const;
    if (current.status !== 'pending') return 'settled_refunded' as const;
    const [order] = await tx.$queryRaw<{ status: string; listingId: string }[]>`
      SELECT "status", "listingId" FROM "Order" WHERE "id" = ${payment.orderId} FOR UPDATE`;
    const [listing] = await tx.$queryRaw<{ status: string; reportHidden: boolean }[]>`
      SELECT "status", "reportHidden" FROM "Listing" WHERE "id" = ${order.listingId} FOR UPDATE`;

    const late = order.status !== 'awaiting_payment' ? 'already_paid' : listing.status !== 'active' || listing.reportHidden ? 'sold' : undefined;
    if (late) {
      // Claimed for the refund below, so no other callback settles it.
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'refunded', paymentUrl: null, providerData: result.data } });
      return late;
    }
    await tx.order.update({ where: { id: payment.orderId }, data: { status: 'escrow_held', pin: newPin(), paidAt: new Date() } });
    await tx.listing.update({ where: { id: order.listingId }, data: { status: 'reserved' } });
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'succeeded', paymentUrl: null, providerData: result.data } });
    return 'paid' as const;
  });
  if (outcome === 'paid') pushSold(payment.orderId);
  if (outcome === 'settled_paid') return 'paid';
  if (outcome === 'settled_refunded') return 'sold';
  if (outcome !== 'paid') {
    try {
      await provider().refund(payment.providerRef, payment.amountFils);
    } catch (error) {
      // Marked refunded but the money is still taken: an admin refunds it by hand.
      console.error(`Refund failed for payment ${payment.providerRef} (order ${payment.orderId})`, error);
      throw error;
    }
  }
  return outcome;
}

/** POST /orders/:id/pay: the order back, paid, or still awaiting_payment with the bank's paymentUrl. */
export async function payOrder(buyerId: string, orderId: string, cardToken: string, returnUrl: string) {
  const payments = provider();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { listing: true } });
  if (!order || order.buyerId !== buyerId) throw new ApiError(404, 'NOT_FOUND', `No order ${orderId}`);
  if (order.status !== 'awaiting_payment') throw new ApiError(422, 'VALIDATION', `This order is already ${order.status}`);
  // Checked again when the money is in; this just avoids charging for nothing.
  if (order.listing.status !== 'active' || order.listing.reportHidden) throw unavailable();

  const result = await payments.charge({ cardToken, amountFils: order.totalFils, orderId, returnUrl });
  const payment = await prisma.payment.create({
    data: {
      orderId,
      provider: payments.name,
      providerRef: result.ref,
      amountFils: order.totalFils,
      status: result.status === 'failed' ? 'failed' : 'pending',
      paymentUrl: result.paymentUrl,
      providerData: result.data,
    },
  });
  if (result.status === 'failed') throw new ApiError(402, 'PAYMENT_DECLINED', 'The card was declined');
  if (result.status === 'succeeded' && (await settle(payment, result)) === 'sold') throw unavailable();
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

export type CallbackOutcome = Outcome | 'failed' | 'pending' | 'unknown';

/**
 * GET /payments/callback?ref=…: the bank's card check is over. The result is
 * asked from the provider (never read from the browser's URL), and a repeated
 * callback changes nothing.
 */
export async function finishCardCheck(ref: string | undefined): Promise<CallbackOutcome> {
  const payment = ref ? await prisma.payment.findUnique({ where: { providerRef: ref } }) : null;
  if (!payment) return 'unknown';
  if (payment.status === 'succeeded') return 'paid';
  if (payment.status === 'refunded') return 'sold';
  if (payment.status === 'failed') return 'failed';

  const result = await provider().status(ref!);
  if (result.status === 'requires_action') return 'pending';
  if (result.status === 'failed') {
    await prisma.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'failed', providerData: result.data } });
    return 'failed';
  }
  return settle(payment, result);
}
