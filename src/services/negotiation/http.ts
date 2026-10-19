// Negotiation & chat API endpoints (docs/API.md → Negotiation & Chat).

import type { Bid, ChatMessage, ChatThread, Offer } from '@/lib/types';
import { api } from '../api/client';
import type { NegotiationService } from './types';

export const httpNegotiationService: NegotiationService = {
  makeOffer: ({ itemId, amountFils }) =>
    api.post<{ offer: Offer; chatId: string }>(
      `/listings/${encodeURIComponent(itemId)}/offers`,
      { amountFils },
    ),

  respondToOffer: (offerId, status, counterAmountFils) =>
    api.post<Offer>(`/offers/${encodeURIComponent(offerId)}/respond`, {
      status,
      counterAmountFils,
    }),

  getBids: itemId =>
    api.get<Bid[]>(`/listings/${encodeURIComponent(itemId)}/bids`),

  placeBid: ({ itemId, amountFils }) =>
    api.post<Bid>(`/listings/${encodeURIComponent(itemId)}/bids`, {
      amountFils,
    }),

  getChatThreads: () => api.get<ChatThread[]>('/chats'),

  getChatMessages: chatId =>
    api.get<ChatMessage[]>(`/chats/${encodeURIComponent(chatId)}/messages`),

  sendMessage: ({ chatId, text }) =>
    api.post<ChatMessage>(`/chats/${encodeURIComponent(chatId)}/messages`, {
      text,
    }),
};
