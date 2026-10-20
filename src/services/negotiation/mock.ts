// Negotiation, bidding & chat answered by mock backend.

import type { Bid, ChatMessage, ChatThread, Offer } from '@/lib/types';
import { ApiError } from '../api/errors';
import { buildItems } from '../mock/catalog';
import { mockLatency } from '../mock/delay';
import type { NegotiationService } from './types';

const catalogItems = buildItems(Date.now());
const mockOffers: Offer[] = [];
const mockBids: Record<string, Bid[]> = {
  'auction-mobiles': [
    {
      id: 'bid-1',
      itemId: 'auction-mobiles',
      bidderId: 'user-2',
      bidderName: 'Omar',
      amountFils: 510000,
      createdAt: Date.now() - 3600000,
    },
    {
      id: 'bid-2',
      itemId: 'auction-mobiles',
      bidderId: 'user-3',
      bidderName: 'Sami',
      amountFils: 520000,
      createdAt: Date.now() - 1800000,
    },
  ],
};

const mockThreads: ChatThread[] = [
  {
    id: 'chat-mobiles-0',
    itemId: 'mobiles-0',
    itemTitle: { ar: 'آيفون 14 برو', en: 'iPhone 14 Pro' },
    itemImageUrl:
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&h=600&fit=crop',
    otherPartyName: 'Omar',
    lastMessage: 'Is this item still available?',
    updatedAt: Date.now() - 7200000,
  },
];

const mockMessages: Record<string, ChatMessage[]> = {
  'chat-mobiles-0': [
    {
      id: 'msg-1',
      chatId: 'chat-mobiles-0',
      senderId: 'user-2',
      senderName: 'Omar',
      text: 'Is this item still available?',
      createdAt: Date.now() - 7200000,
    },
  ],
};

/** For the orders mock: an accepted offer sets the checkout price. */
export const findMockOffer = (offerId: string) =>
  mockOffers.find(o => o.id === offerId);

export const mockNegotiationService: NegotiationService = {
  makeOffer: async ({ itemId, amountFils }) => {
    await mockLatency();
    const item = catalogItems.find(i => i.id === itemId);
    const title = item?.title ?? { ar: 'عنصر', en: 'Item' };
    const imageUrl =
      item?.imageUrl ??
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop';
    const seller = item?.seller.en ?? 'Seller';

    const offerId = `offer-${Date.now()}`;
    const chatId = `chat-${itemId}-${Date.now()}`;

    const offer: Offer = {
      id: offerId,
      itemId,
      itemTitle: title,
      itemImageUrl: imageUrl,
      buyerId: 'me',
      buyerName: 'Ahmad',
      sellerName: seller,
      amountFils,
      status: 'pending',
      createdAt: Date.now(),
    };

    const thread: ChatThread = {
      id: chatId,
      itemId,
      itemTitle: title,
      itemImageUrl: imageUrl,
      otherPartyName: seller,
      lastMessage: `Offer submitted: ${amountFils / 1000} JOD`,
      updatedAt: Date.now(),
    };

    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      chatId,
      senderId: 'me',
      senderName: 'Ahmad',
      text: `Made an offer of ${amountFils / 1000} JOD`,
      offer,
      createdAt: Date.now(),
    };

    mockOffers.push(offer);
    mockThreads.unshift(thread);
    mockMessages[chatId] = [message];

    return { offer, chatId };
  },

  getOffer: async offerId => {
    await mockLatency();
    const offer = findMockOffer(offerId);
    if (!offer) throw new ApiError('NOT_FOUND');
    return { ...offer };
  },

  respondToOffer: async (offerId, status, counterAmountFils) => {
    await mockLatency();
    const offer = mockOffers.find(o => o.id === offerId);
    if (!offer) throw new ApiError('NOT_FOUND');
    offer.status = status;
    if (counterAmountFils) offer.amountFils = counterAmountFils;
    return offer;
  },

  getBids: async itemId => {
    await mockLatency();
    return mockBids[itemId] ?? [];
  },

  placeBid: async ({ itemId, amountFils }) => {
    await mockLatency();
    const itemBids = mockBids[itemId] ?? [];
    const highestBid = itemBids[itemBids.length - 1]?.amountFils ?? 0;

    if (amountFils <= highestBid) {
      throw new ApiError('VALIDATION', 'Bid must be higher than current bid');
    }

    const bid: Bid = {
      id: `bid-${Date.now()}`,
      itemId,
      bidderId: 'me',
      bidderName: 'Ahmad',
      amountFils,
      createdAt: Date.now(),
    };

    if (!mockBids[itemId]) mockBids[itemId] = [];
    mockBids[itemId].push(bid);

    // Update mock catalog item price
    const item = catalogItems.find(i => i.id === itemId);
    if (item) {
      item.priceFils = amountFils;
      if (item.auction) item.auction.bidCount += 1;
    }

    return bid;
  },

  getChatThreads: async () => {
    await mockLatency();
    return mockThreads;
  },

  getChatMessages: async chatId => {
    await mockLatency();
    return mockMessages[chatId] ?? [];
  },

  sendMessage: async ({ chatId, text }) => {
    await mockLatency();
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      chatId,
      senderId: 'me',
      senderName: 'Ahmad',
      text,
      createdAt: Date.now(),
    };

    if (!mockMessages[chatId]) mockMessages[chatId] = [];
    mockMessages[chatId].push(message);

    const thread = mockThreads.find(t => t.id === chatId);
    if (thread) {
      thread.lastMessage = text;
      thread.updatedAt = Date.now();
    }

    return message;
  },
};
