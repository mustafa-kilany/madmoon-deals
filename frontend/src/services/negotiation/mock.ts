// Negotiation, bidding, chat and safety answered by the mock backend (in
// memory). It enforces the same rules as the API (docs/API.md): only the
// seller answers a pending offer, only the buyer answers a counter, nobody
// bids on or offers for their own listing. Demo sellers answer offers by
// themselves a few seconds later (answerAsSellers), so the offer → checkout
// flow can be tried alone.

import type {
  ChatMessage,
  ChatThread,
  Item,
  Offer,
  ReportReason,
} from '@/lib/types';
import { ApiError } from '../api/errors';
import { mockLatency } from '../mock/delay';
import { bids, blocked, findItem, me, nextId } from '../mock/marketplace';
import type { NegotiationService, ReportInput } from './types';

const SELLER_REPLY_MS = 4000;
const REASONS: ReportReason[] = [
  'scam',
  'prohibited',
  'offensive',
  'wrong_info',
  'other',
];

const offers: Offer[] = [];
/** Offer id → its chat. */
const offerChats: Record<string, string> = {};
/** The caller's conversation with the seller of the first demo phone. */
const threads: ChatThread[] = [
  {
    id: 'chat-mobiles-0',
    itemId: 'mobiles-0',
    itemTitle: { ar: 'آيفون 14 برو', en: 'iPhone 14 Pro' },
    itemImageUrl:
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&h=600&fit=crop',
    otherPartyId: 'user-omar',
    otherPartyName: 'Omar',
    lastMessage: 'Hi! Yes, it is still available.',
    updatedAt: Date.now() - 7200000,
  },
];
/** Messages per chat, oldest first; `offer` points at the live offer. */
const messages: Record<string, ChatMessage[]> = {
  'chat-mobiles-0': [
    {
      id: 'msg-1',
      chatId: 'chat-mobiles-0',
      senderId: 'user-omar',
      senderName: 'Omar',
      text: 'Hi! Yes, it is still available.',
      createdAt: Date.now() - 7200000,
    },
  ],
};
const reports: (ReportInput & { by: string })[] = [];

const jodText = (fils: number) => `${fils / 1000} JOD`;

function post(
  chatId: string,
  sender: { id: string; name: string },
  text: string,
  offer?: Offer,
) {
  const message: ChatMessage = {
    id: nextId('msg'),
    chatId,
    senderId: sender.id,
    senderName: sender.name,
    text,
    offer,
    createdAt: Date.now(),
  };
  (messages[chatId] ??= []).push(message);
  const thread = threads.find(t => t.id === chatId);
  if (thread) {
    thread.lastMessage = text;
    thread.updatedAt = message.createdAt;
  }
  return message;
}

/** A copy as the API returns it: `offer` is the offer's current state. */
const publicMessage = (m: ChatMessage): ChatMessage => ({
  ...m,
  offer: m.offer && { ...m.offer },
});

/** For the orders mock: an accepted offer sets the checkout price. */
export const findMockOffer = (offerId: string) =>
  offers.find(o => o.id === offerId);

/** Demo counter: halfway between offer and price, in whole dinars. */
const counterFor = (offer: Offer, item: Item) =>
  Math.round((offer.amountFils + item.priceFils) / 2 / 1000) * 1000;

/**
 * Demo sellers answer pending offers SELLER_REPLY_MS after they were made:
 * 90% of the price or more is accepted, anything lower is countered halfway.
 * Runs whenever chats are read. Tests pass a later `at` instead of waiting.
 */
export function answerAsSellers(at = Date.now()) {
  for (const offer of offers) {
    if (offer.status !== 'pending' || offer.sellerId === me().id) continue;
    if (at - offer.createdAt < SELLER_REPLY_MS) continue;
    const item = findItem(offer.itemId);
    const seller = { id: offer.sellerId, name: offer.sellerName };
    if (offer.amountFils >= item.priceFils * 0.9) {
      offer.status = 'accepted';
      post(offerChats[offer.id], seller, 'Offer accepted', offer);
    } else {
      offer.status = 'countered';
      offer.counterAmountFils = counterFor(offer, item);
      post(
        offerChats[offer.id],
        seller,
        `Counter offer: ${jodText(offer.counterAmountFils)}`,
        offer,
      );
    }
  }
}

export const mockNegotiationService: NegotiationService = {
  makeOffer: async ({ itemId, amountFils }) => {
    await mockLatency();
    const item = findItem(itemId);
    const buyer = me();
    if (item.sellerId === buyer.id)
      throw new ApiError('FORBIDDEN', 'Your own listing', 403);
    if (
      item.status !== 'active' ||
      item.saleType !== 'fixed' ||
      blocked.has(item.sellerId)
    )
      throw new ApiError('ITEM_UNAVAILABLE', 'Not for sale', 409);
    if (!(amountFils > 0))
      throw new ApiError('VALIDATION', 'amountFils must be positive', 422);

    const offer: Offer = {
      id: nextId('offer'),
      itemId,
      itemTitle: item.title,
      itemImageUrl: item.imageUrl,
      buyerId: buyer.id,
      buyerName: buyer.name,
      sellerId: item.sellerId,
      sellerName: item.seller.en,
      amountFils,
      status: 'pending',
      createdAt: Date.now(),
    };
    offers.push(offer);

    // One conversation per buyer and listing.
    let thread = threads.find(
      t => t.itemId === itemId && t.otherPartyId === item.sellerId,
    );
    if (!thread) {
      thread = {
        id: nextId('chat'),
        itemId,
        itemTitle: item.title,
        itemImageUrl: item.imageUrl,
        otherPartyId: item.sellerId,
        otherPartyName: item.seller.en,
        lastMessage: '',
        updatedAt: Date.now(),
      };
      threads.unshift(thread);
    }
    offerChats[offer.id] = thread.id;
    post(thread.id, buyer, `Made an offer of ${jodText(amountFils)}`, offer);
    return { offer: { ...offer }, chatId: thread.id };
  },

  getOffer: async offerId => {
    await mockLatency();
    answerAsSellers();
    const offer = findMockOffer(offerId);
    if (!offer) throw new ApiError('NOT_FOUND', 'Offer not found', 404);
    const caller = me().id;
    if (caller !== offer.buyerId && caller !== offer.sellerId)
      throw new ApiError('FORBIDDEN', 'Not your offer', 403);
    return { ...offer };
  },

  respondToOffer: async (offerId, status, counterAmountFils) => {
    await mockLatency();
    const offer = findMockOffer(offerId);
    if (!offer) throw new ApiError('NOT_FOUND', 'Offer not found', 404);
    if (status === 'pending')
      throw new ApiError(
        'VALIDATION',
        'status: accepted, countered or rejected',
        422,
      );
    const caller = me();
    const chatId = offerChats[offer.id];

    if (offer.status === 'pending') {
      if (caller.id !== offer.sellerId)
        throw new ApiError('FORBIDDEN', 'Only the seller answers', 403);
      if (status === 'countered') {
        if (!counterAmountFils || counterAmountFils <= offer.amountFils)
          throw new ApiError(
            'VALIDATION',
            'counterAmountFils must be above the offer',
            422,
          );
        offer.counterAmountFils = counterAmountFils;
      }
    } else if (offer.status === 'countered') {
      if (caller.id !== offer.buyerId)
        throw new ApiError('FORBIDDEN', 'Only the buyer answers', 403);
      if (status === 'countered')
        throw new ApiError('VALIDATION', 'Make a new offer instead', 422);
      if (status === 'accepted') offer.amountFils = offer.counterAmountFils!;
    } else {
      throw new ApiError('VALIDATION', `Offer is already ${offer.status}`, 422);
    }
    offer.status = status;
    const text =
      status === 'accepted'
        ? `Accepted ${jodText(offer.amountFils)}`
        : status === 'rejected'
        ? 'Offer declined'
        : `Counter offer: ${jodText(offer.counterAmountFils!)}`;
    post(chatId, caller, text, offer);
    return { ...offer };
  },

  getBids: async itemId => {
    await mockLatency();
    // Newest first, like every list except chat messages.
    return [...(bids[itemId] ?? [])].reverse();
  },

  placeBid: async ({ itemId, amountFils }) => {
    await mockLatency();
    const item = findItem(itemId);
    const bidder = me();
    if (!item.auction) throw new ApiError('VALIDATION', 'Not an auction', 422);
    if (item.sellerId === bidder.id)
      throw new ApiError('FORBIDDEN', 'Your own auction', 403);
    if (item.auction.endsAt <= Date.now())
      throw new ApiError('VALIDATION', 'The auction has ended', 422);
    const minimum = item.priceFils + item.auction.incrementFils;
    if (amountFils < minimum)
      throw new ApiError('VALIDATION', `Bid at least ${minimum} fils`, 422);

    const bid = {
      id: nextId('bid'),
      itemId,
      bidderId: bidder.id,
      bidderName: bidder.name,
      amountFils,
      createdAt: Date.now(),
    };
    (bids[itemId] ??= []).push(bid);
    item.priceFils = amountFils;
    item.auction.bidCount += 1;
    return { ...bid };
  },

  getChatThreads: async () => {
    await mockLatency();
    answerAsSellers();
    return threads
      .filter(t => !blocked.has(t.otherPartyId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(t => ({ ...t }));
  },

  getChatMessages: async chatId => {
    await mockLatency();
    answerAsSellers();
    return (messages[chatId] ?? []).map(publicMessage);
  },

  sendMessage: async ({ chatId, text }) => {
    await mockLatency();
    const thread = threads.find(t => t.id === chatId);
    if (!thread) throw new ApiError('NOT_FOUND', 'Chat not found', 404);
    if (blocked.has(thread.otherPartyId))
      throw new ApiError('FORBIDDEN', 'You blocked this user', 403);
    return publicMessage(post(chatId, me(), text.trim()));
  },

  report: async input => {
    await mockLatency();
    if (!REASONS.includes(input.reason))
      throw new ApiError('VALIDATION', 'Unknown reason', 422);
    if (input.target.type === 'listing') findItem(input.target.id);
    reports.push({ ...input, by: me().id });
  },

  blockUser: async userId => {
    await mockLatency();
    if (userId === me().id)
      throw new ApiError('VALIDATION', 'You cannot block yourself', 422);
    const thread = threads.find(t => t.otherPartyId === userId);
    blocked.set(userId, thread?.otherPartyName ?? userId);
  },

  unblockUser: async userId => {
    await mockLatency();
    blocked.delete(userId);
  },

  getBlockedUsers: async () => {
    await mockLatency();
    return [...blocked].map(([id, name]) => ({ id, name }));
  },
};
