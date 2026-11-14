import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { pushDelivered } from '../notifications/notify';
import { orderInclude } from '../orders/shapes';

// POST /courier/confirm-delivery (BACKEND_PLAN B7.6): the buyer tells the
// courier the 4-digit PIN at the door. The right PIN completes the order, marks
// the listing sold and releases the escrow to the seller (a Payout row).

/** Tries per order, wrong or right. Then it's locked until an admin unlocks it (B7.7). */
export const PIN_TRIES = 5;

export async function confirmDelivery(courierId: string, orderId: string, pin: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  // S2.2: only the courier the order is assigned to (an unassigned order isn't anyone's to confirm).
  if (!order || order.courierId !== courierId)
    throw new ApiError(404, 'NOT_FOUND', `No order ${orderId}`);
  if (order.status !== 'escrow_held') throw new ApiError(422, 'VALIDATION', `This order is ${order.status}, not waiting for delivery`);
  if (order.courierStatus === 'failed') throw new ApiError(422, 'VALIDATION', 'Marked as failed: Madmoon Deals’ team decides what happens next');

  // The driver must have the item: a PIN alone (given early, or guessed) can't release the money.
  if (order.courierStatus !== 'picked_up') throw new ApiError(422, 'VALIDATION', 'Mark it as picked up first');

  // The try is counted before the PIN is compared, so many guesses sent at once
  // still get only PIN_TRIES chances.
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: 'escrow_held', pinAttempts: { lt: PIN_TRIES } },
    data: { pinAttempts: { increment: 1 } },
  });
  if (!count)
    throw new ApiError(429, 'RATE_LIMITED', `Locked after ${PIN_TRIES} wrong PINs: Madmoon Deals support can unlock it`);
  if (pin !== order.pin) {
    const left = PIN_TRIES - (order.pinAttempts + 1);
    throw new ApiError(422, 'INVALID_PIN', `Wrong PIN (${Math.max(left, 0)} tries left)`);
  }

  const delivered = await prisma.$transaction(async tx => {
    const done = await tx.order.updateMany({
      where: { id: orderId, status: 'escrow_held' },
      data: { status: 'completed', deliveredAt: new Date(), courierStatus: 'delivered', courierId },
    });
    if (!done.count) throw new ApiError(422, 'VALIDATION', 'This order was just completed or refunded');
    await tx.listing.update({ where: { id: order.listingId }, data: { status: 'sold' } });
    // Madmoon Deals takes no seller fee: the seller gets the item price (protection and delivery are the buyer's).
    await tx.payout.create({
      data: { orderId, sellerUserId: order.sellerUserId, storeId: order.storeId, amountFils: order.itemPriceFils },
    });
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  }, { maxWait: 10_000, timeout: 15_000 });
  pushDelivered(orderId);
  return delivered;
}
