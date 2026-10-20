// Negotiation & chat API endpoints (docs/API.md → Negotiation & Chat).

import type { Bid, ChatMessage, ChatThread, Offer } from '@/lib/types';
import { api } from '../api/client';
import { fromIso, type Dated } from '../api/wire';
import type { NegotiationService } from './types';

type OfferDto = Dated<Offer, 'createdAt'>;
type BidDto = Dated<Bid, 'createdAt'>;
type ThreadDto = Dated<ChatThread, 'updatedAt'>;
type MessageDto = Omit<Dated<ChatMessage, 'createdAt'>, 'offer'> & {
  offer?: OfferDto;
};

const toOffer = (o: OfferDto): Offer => ({
  ...o,
  createdAt: fromIso(o.createdAt),
});
const toBid = (b: BidDto): Bid => ({ ...b, createdAt: fromIso(b.createdAt) });
const toThread = (t: ThreadDto): ChatThread => ({
  ...t,
  updatedAt: fromIso(t.updatedAt),
});
const toMessage = ({ offer, ...m }: MessageDto): ChatMessage => ({
  ...m,
  createdAt: fromIso(m.createdAt),
  offer: offer && toOffer(offer),
});

export const httpNegotiationService: NegotiationService = {
  makeOffer: async ({ itemId, amountFils }) => {
    const { offer, chatId } = await api.post<{
      offer: OfferDto;
      chatId: string;
    }>(`/listings/${encodeURIComponent(itemId)}/offers`, { amountFils });
    return { offer: toOffer(offer), chatId };
  },

  getOffer: async offerId =>
    toOffer(await api.get<OfferDto>(`/offers/${encodeURIComponent(offerId)}`)),

  respondToOffer: async (offerId, status, counterAmountFils) =>
    toOffer(
      await api.post<OfferDto>(
        `/offers/${encodeURIComponent(offerId)}/respond`,
        { status, counterAmountFils },
      ),
    ),

  getBids: async itemId =>
    (
      await api.get<BidDto[]>(`/listings/${encodeURIComponent(itemId)}/bids`)
    ).map(toBid),

  placeBid: async ({ itemId, amountFils }) =>
    toBid(
      await api.post<BidDto>(`/listings/${encodeURIComponent(itemId)}/bids`, {
        amountFils,
      }),
    ),

  getChatThreads: async () =>
    (await api.get<ThreadDto[]>('/chats')).map(toThread),

  getChatMessages: async chatId =>
    (
      await api.get<MessageDto[]>(
        `/chats/${encodeURIComponent(chatId)}/messages`,
      )
    ).map(toMessage),

  sendMessage: async ({ chatId, text }) =>
    toMessage(
      await api.post<MessageDto>(
        `/chats/${encodeURIComponent(chatId)}/messages`,
        { text },
      ),
    ),
};
