import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { pushOffer } from '../notifications/notify';
import { isBlockedBetween } from '../safety/blocks';
import { post } from './chats';
import { offerInclude } from './shapes';

// Offers (BACKEND_PLAN B6.2), docs/API.md → Offer flow. Turns: the seller
// answers a pending offer (accept, counter above it, reject); the buyer answers a
// counter (accept at the counter price, or reject) and can then offer again.
// Every step also posts a message carrying the offer in the buyer's chat.

const jod = (fils: number) => `${fils / 1000} JOD`;
const unavailable = () => new ApiError(409, 'ITEM_UNAVAILABLE', 'This listing isn’t taking offers');

/** POST /listings/:id/offers → { offer, chatId }. */
export async function makeOffer(buyerId: string, listingId: string, amountFils: number) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status === 'withdrawn') throw new ApiError(404, 'NOT_FOUND', `No listing ${listingId}`);
  if (listing.sellerUserId === buyerId) throw new ApiError(403, 'FORBIDDEN', 'Your own listing');
  // Brand stores sell at their price; auctions take bids; reserved / sold aren't for sale.
  if (!listing.sellerUserId || listing.saleType !== 'fixed' || listing.status !== 'active' || listing.reportHidden)
    throw unavailable();
  if (await isBlockedBetween(buyerId, listing.sellerUserId)) throw unavailable();
  const open = await prisma.offer.count({ where: { listingId, buyerId, status: { in: ['pending', 'countered'] } } });
  if (open) throw new ApiError(422, 'VALIDATION', 'Your last offer on this listing is still waiting for an answer');

  const made = await prisma.$transaction(async tx => {
    const chat = await tx.chat.upsert({
      where: { listingId_buyerId: { listingId, buyerId } },
      create: { listingId, buyerId },
      update: {},
    });
    const offer = await tx.offer.create({ data: { listingId, buyerId, chatId: chat.id, amountFils } });
    await post(tx, chat.id, buyerId, `Made an offer of ${jod(amountFils)}`, offer.id);
    return { offer: await tx.offer.findUniqueOrThrow({ where: { id: offer.id }, include: offerInclude }), chatId: chat.id };
  });
  pushOffer(made.offer.id, buyerId);
  return made;
}

/** GET /offers/:id: the buyer's or the seller's. */
export async function getOffer(userId: string, offerId: string) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: offerInclude });
  if (!offer) throw new ApiError(404, 'NOT_FOUND', `No offer ${offerId}`);
  if (userId !== offer.buyerId && userId !== offer.listing.sellerUserId)
    throw new ApiError(403, 'FORBIDDEN', 'Not your offer');
  return offer;
}

export type Answer = { status: 'accepted' | 'countered' | 'rejected'; counterAmountFils?: number };

/** POST /offers/:id/respond. */
export async function respondToOffer(userId: string, offerId: string, answer: Answer) {
  const offer = await getOffer(userId, offerId);
  const sellerId = offer.listing.sellerUserId!;
  if (offer.status === 'accepted' || offer.status === 'rejected')
    throw new ApiError(422, 'VALIDATION', `This offer is already ${offer.status}`);
  const turn = offer.status === 'pending' ? sellerId : offer.buyerId;
  if (userId !== turn)
    throw new ApiError(403, 'FORBIDDEN', offer.status === 'pending' ? 'Only the seller answers' : 'Only the buyer answers');

  let data: { status: Answer['status']; amountFils?: number; counterAmountFils?: number };
  let text: string;
  if (answer.status === 'countered') {
    if (offer.status === 'countered') throw new ApiError(422, 'VALIDATION', 'Make a new offer instead');
    if (!answer.counterAmountFils || answer.counterAmountFils <= offer.amountFils)
      throw new ApiError(422, 'VALIDATION', 'counterAmountFils must be above the offer');
    data = { status: 'countered', counterAmountFils: answer.counterAmountFils };
    text = `Counter offer: ${jod(answer.counterAmountFils)}`;
  } else if (answer.status === 'accepted') {
    // Accepting the counter makes it the agreed price.
    const price = offer.status === 'countered' ? offer.counterAmountFils! : offer.amountFils;
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: offer.listingId } });
    if (listing.status !== 'active') throw unavailable();
    if (await isBlockedBetween(offer.buyerId, sellerId)) throw new ApiError(403, 'FORBIDDEN', 'Blocked');
    data = { status: 'accepted', amountFils: price };
    text = `Accepted ${jod(price)}`;
  } else {
    data = { status: 'rejected' };
    text = 'Offer declined';
  }

  const answered = await prisma.$transaction(async tx => {
    // Only from the state we checked: two answers at once can't both apply.
    const { count } = await tx.offer.updateMany({ where: { id: offerId, status: offer.status }, data });
    if (!count) throw new ApiError(422, 'VALIDATION', 'This offer was just answered');
    await post(tx, offer.chatId, userId, text, offerId);
    return tx.offer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  });
  pushOffer(offerId, userId);
  return answered;
}
