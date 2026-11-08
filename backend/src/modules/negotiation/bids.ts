import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { pushAuctionWon, pushOutbid } from '../notifications/notify';
import { isBlockedBetween, sellerSuspended } from '../safety/blocks';
import { bidInclude } from './shapes';

// Auctions (BACKEND_PLAN B6.3, B6.4). The listing's priceFils is the current bid
// (the starting bid until someone bids); the next bid is at least that plus the
// increment.

type LockedListing = {
  status: string;
  saleType: string;
  priceFils: number;
  incrementFils: number | null;
  auctionEndsAt: Date | null;
  sellerUserId: string | null;
  reportHidden: boolean;
};

/** POST /listings/:id/bids. The listing row is locked, so two bids at once are checked one after the other. */
export async function placeBid(bidderId: string, listingId: string, amountFils: number) {
  const { bid, outbid } = await prisma.$transaction(async tx => {
    const [listing] = await tx.$queryRaw<LockedListing[]>`
      SELECT "status", "saleType", "priceFils", "incrementFils", "auctionEndsAt", "sellerUserId", "reportHidden"
      FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
    if (!listing || listing.status === 'withdrawn') throw new ApiError(404, 'NOT_FOUND', `No listing ${listingId}`);
    if (listing.saleType !== 'auction') throw new ApiError(422, 'VALIDATION', 'Not an auction');
    if (listing.sellerUserId === bidderId) throw new ApiError(403, 'FORBIDDEN', 'Your own auction');
    if (!listing.auctionEndsAt || listing.auctionEndsAt <= new Date())
      throw new ApiError(422, 'VALIDATION', 'The auction has ended');
    if (
      listing.status !== 'active' ||
      listing.reportHidden ||
      (await sellerSuspended(listing.sellerUserId, tx)) ||
      (listing.sellerUserId && (await isBlockedBetween(bidderId, listing.sellerUserId, tx)))
    )
      throw new ApiError(409, 'ITEM_UNAVAILABLE', 'This auction isn’t taking bids');
    const minimum = listing.priceFils + (listing.incrementFils ?? 0);
    if (amountFils < minimum) throw new ApiError(422, 'VALIDATION', `Bid at least ${minimum} fils`);

    const leader = await tx.bid.findFirst({ where: { listingId }, orderBy: [{ amountFils: 'desc' }, { createdAt: 'asc' }] });
    await tx.listing.update({ where: { id: listingId }, data: { priceFils: amountFils, bidCount: { increment: 1 } } });
    const bid = await tx.bid.create({ data: { listingId, bidderId, amountFils }, include: bidInclude });
    return { bid, outbid: leader && leader.bidderId !== bidderId ? leader.bidderId : undefined };
    // A popular auction queues on its row lock: wait in line rather than fail.
  }, { maxWait: 10_000, timeout: 15_000 });
  if (outbid) pushOutbid(listingId, outbid);
  return bid;
}

/** GET /listings/:id/bids: newest (highest) first. */
export async function listBids(listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { status: true } });
  if (!listing || listing.status === 'withdrawn') throw new ApiError(404, 'NOT_FOUND', `No listing ${listingId}`);
  return prisma.bid.findMany({
    where: { listingId },
    include: bidInclude,
    orderBy: [{ amountFils: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
}

/**
 * B6.4: auctions whose end time passed get their winner, the highest bidder
 * (who may then check out at that price). No bids: closed without a winner.
 */
export async function closeEndedAuctions(now = new Date()) {
  const ended = await prisma.listing.findMany({
    where: { saleType: 'auction', status: 'active', auctionClosedAt: null, auctionEndsAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  for (const { id } of ended) {
    const top = await prisma.bid.findFirst({ where: { listingId: id }, orderBy: [{ amountFils: 'desc' }, { createdAt: 'asc' }] });
    const { count } = await prisma.listing.updateMany({
      where: { id, auctionClosedAt: null },
      data: { auctionClosedAt: now, auctionWinnerId: top?.bidderId ?? null },
    });
    if (count && top) pushAuctionWon(id);
  }
  return ended.length;
}

/** Every minute while the server is up. Safe on several servers: each auction is closed once. */
export function scheduleAuctionClosing() {
  setInterval(() => {
    closeEndedAuctions().catch(error => logger.error({ err: error }, 'Closing auctions failed'));
  }, 60_000);
}
