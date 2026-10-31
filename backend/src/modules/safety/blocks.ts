import { prisma } from '../../db';
import type { Prisma } from '../../generated/prisma/client';

// A block works both ways (docs/API.md → Safety): neither sees the other's
// listings or chats, and they can't message, offer, bid or order between them.

/** Everyone this user blocked or was blocked by. */
export async function blockedWith(userId: string) {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map(r => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
}

export async function isBlockedBetween(a: string, b: string) {
  const block = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return !!block;
}

/** A suspended seller's listings are off sale (BACKEND_PLAN B8.5): no orders, offers or bids. */
export async function sellerSuspended(sellerUserId: string | null) {
  if (!sellerUserId) return false; // a brand store
  const seller = await prisma.user.findUnique({ where: { id: sellerUserId }, select: { suspended: true } });
  return seller?.suspended ?? false;
}

/**
 * GET /listings for this viewer: nothing reported off the shelves or from a
 * suspended seller, and nothing from people they blocked or who blocked them.
 * Brand stores are never blocked.
 */
export async function visibleListings(viewerId: string | undefined): Promise<Prisma.ListingWhereInput[]> {
  const hidden = viewerId ? await blockedWith(viewerId) : [];
  return [
    { reportHidden: false },
    { OR: [{ sellerUserId: null }, { sellerUser: { suspended: false } }] },
    ...(hidden.length ? [{ OR: [{ sellerUserId: null }, { sellerUserId: { notIn: hidden } }] }] : []),
  ];
}
