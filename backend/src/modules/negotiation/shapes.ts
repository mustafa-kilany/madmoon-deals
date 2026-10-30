import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client';
import { coverUrl } from '../catalog/apiItem';

// Rows → docs/API.md → Phase 5 types (Offer, ChatThread, ChatMessage, Bid).

const listingSummary = {
  select: { id: true, titleAr: true, titleEn: true, imageUrls: true, sellerUserId: true, sellerUser: { select: { name: true } } },
} as const;

export const offerInclude = {
  listing: listingSummary,
  buyer: { select: { name: true } },
} satisfies Prisma.OfferInclude;
export type OfferRow = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

export const toApiOffer = (offer: OfferRow, req: Request) => ({
  id: offer.id,
  itemId: offer.listingId,
  itemTitle: { ar: offer.listing.titleAr, en: offer.listing.titleEn },
  itemImageUrl: coverUrl(offer.listing.imageUrls, req),
  buyerId: offer.buyerId,
  buyerName: offer.buyer.name,
  sellerId: offer.listing.sellerUserId ?? '',
  sellerName: offer.listing.sellerUser?.name ?? '',
  amountFils: offer.amountFils,
  ...(offer.counterAmountFils !== null && { counterAmountFils: offer.counterAmountFils }),
  status: offer.status,
  createdAt: offer.createdAt.toISOString(),
});

export const chatInclude = {
  listing: listingSummary,
  buyer: { select: { name: true } },
} satisfies Prisma.ChatInclude;
export type ChatRow = Prisma.ChatGetPayload<{ include: typeof chatInclude }>;

/** The other side: the seller for the buyer, the buyer for the seller. */
export const toApiThread = (chat: ChatRow, me: string, req: Request) => {
  const iAmBuyer = chat.buyerId === me;
  return {
    id: chat.id,
    itemId: chat.listingId,
    itemTitle: { ar: chat.listing.titleAr, en: chat.listing.titleEn },
    itemImageUrl: coverUrl(chat.listing.imageUrls, req),
    otherPartyId: iAmBuyer ? (chat.listing.sellerUserId ?? '') : chat.buyerId,
    otherPartyName: iAmBuyer ? (chat.listing.sellerUser?.name ?? '') : chat.buyer.name,
    lastMessage: chat.lastMessage,
    updatedAt: chat.updatedAt.toISOString(),
  };
};

export const messageInclude = {
  sender: { select: { name: true } },
  offer: { include: offerInclude },
} satisfies Prisma.MessageInclude;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

/** `offer` is the offer's current state, not what it was when the message was posted. */
export const toApiMessage = (message: MessageRow, req: Request) => ({
  id: message.id,
  chatId: message.chatId,
  senderId: message.senderId,
  senderName: message.sender.name,
  text: message.text,
  ...(message.offer && { offer: toApiOffer(message.offer, req) }),
  createdAt: message.createdAt.toISOString(),
});

export const bidInclude = { bidder: { select: { name: true } } } satisfies Prisma.BidInclude;
export type BidRow = Prisma.BidGetPayload<{ include: typeof bidInclude }>;

export const toApiBid = (bid: BidRow) => ({
  id: bid.id,
  itemId: bid.listingId,
  bidderId: bid.bidderId,
  bidderName: bid.bidder.name,
  amountFils: bid.amountFils,
  createdAt: bid.createdAt.toISOString(),
});
