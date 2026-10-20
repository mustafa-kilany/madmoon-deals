// What the app needs for offers, auctions bidding and chat threads.

import type {
  Bid,
  ChatMessage,
  ChatThread,
  Offer,
  OfferStatus,
} from '@/lib/types';

export type MakeOfferInput = {
  itemId: string;
  amountFils: number;
};

export type PlaceBidInput = {
  itemId: string;
  amountFils: number;
};

export type SendMessageInput = {
  chatId: string;
  text: string;
};

export interface NegotiationService {
  makeOffer(input: MakeOfferInput): Promise<{ offer: Offer; chatId: string }>;
  respondToOffer(
    offerId: string,
    status: OfferStatus,
    counterAmountFils?: number,
  ): Promise<Offer>;
  getBids(itemId: string): Promise<Bid[]>;
  placeBid(input: PlaceBidInput): Promise<Bid>;
  getChatThreads(): Promise<ChatThread[]>;
  getChatMessages(chatId: string): Promise<ChatMessage[]>;
  sendMessage(input: SendMessageInput): Promise<ChatMessage>;
}
