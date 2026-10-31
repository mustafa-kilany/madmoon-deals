import { calculateCheckoutBreakdown } from '@/lib/money';
import { randomInt } from 'node:crypto';
import { prisma } from '../../db';
import { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { closeEndedAuctions } from '../negotiation/bids';
import { isBlockedBetween } from '../safety/blocks';
import { deliveryColumns, type DeliveryInput } from './delivery';
import { orderInclude } from './shapes';

// POST /orders (BACKEND_PLAN B7.2), docs/API.md → Phase 6. The server prices
// every order: the listing's price, an accepted offer's, or the winning bid,
// plus buyer protection and delivery (the app's calculateCheckoutBreakdown).

const unavailable = (message = 'This listing can’t be bought') => new ApiError(409, 'ITEM_UNAVAILABLE', message);
const invalid = (message: string) => new ApiError(422, 'VALIDATION', message);

/** "SA-123456": short enough for a courier to type. Retried on the rare clash. */
const newOrderId = () => `SA-${randomInt(100_000, 1_000_000)}`;

export type NewOrder = { listingId: string; offerId?: string; delivery: DeliveryInput };

/** The price this buyer pays for the item, after checking they may buy it. */
async function itemPrice(buyerId: string, input: NewOrder) {
  let listing = await prisma.listing.findUnique({ where: { id: input.listingId } });
  if (!listing || listing.status === 'withdrawn') throw new ApiError(404, 'NOT_FOUND', `No listing ${input.listingId}`);
  if (listing.sellerUserId === buyerId) throw new ApiError(403, 'FORBIDDEN', 'Your own listing');
  if (listing.status !== 'active' || listing.reportHidden) throw unavailable();
  if (listing.sellerUserId && (await isBlockedBetween(buyerId, listing.sellerUserId))) throw unavailable();

  if (listing.saleType === 'auction') {
    if (input.offerId) throw invalid('offerId: auctions are bought at the winning bid');
    if (!listing.auctionEndsAt || listing.auctionEndsAt > new Date()) throw unavailable('The auction hasn’t ended');
    // Ended a moment ago: don't wait for the closing job.
    if (!listing.auctionClosedAt) {
      await closeEndedAuctions();
      listing = await prisma.listing.findUniqueOrThrow({ where: { id: input.listingId } });
    }
    if (listing.auctionWinnerId !== buyerId) throw unavailable('Only the auction’s winner can buy it');
    return { listing, priceFils: listing.priceFils };
  }

  if (input.offerId) {
    const offer = await prisma.offer.findUnique({ where: { id: input.offerId } });
    if (!offer || offer.listingId !== listing.id || offer.buyerId !== buyerId || offer.status !== 'accepted')
      throw invalid('offerId: an offer of yours on this listing that the seller accepted');
    return { listing, priceFils: offer.amountFils };
  }
  return { listing, priceFils: listing.priceFils };
}

/**
 * → an order awaiting payment. Checking out again (a changed address, an offer
 * accepted since) updates the buyer's unpaid order for this listing instead of
 * adding another one.
 */
export async function createOrder(buyerId: string, input: NewOrder) {
  const { listing, priceFils } = await itemPrice(buyerId, input);
  const breakdown = calculateCheckoutBreakdown(priceFils);
  const data = {
    ...breakdown,
    offerId: input.offerId ?? null,
    ...deliveryColumns(input.delivery),
  };

  const unpaid = await prisma.order.findFirst({
    where: { listingId: listing.id, buyerId, status: 'awaiting_payment' },
    select: { id: true },
  });
  if (unpaid) return prisma.order.update({ where: { id: unpaid.id }, data, include: orderInclude });

  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.order.create({
        data: {
          ...data,
          id: newOrderId(),
          listingId: listing.id,
          buyerId,
          sellerUserId: listing.sellerUserId,
          storeId: listing.storeId,
        },
        include: orderInclude,
      });
    } catch (error) {
      const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!clash || attempt === 5) throw error;
    }
  }
}
