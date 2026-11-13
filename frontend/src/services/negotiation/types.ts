// What the app needs for offers, auctions bidding, chat threads, and
// safety (report, block).

import type {
  Bid,
  BlockedUser,
  ChatMessage,
  ChatThread,
  Offer,
  OfferStatus,
  ReportReason,
  ReportTarget,
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

export type ReportInput = {
  target: ReportTarget;
  reason: ReportReason;
  details?: string;
};

export interface NegotiationService {
  makeOffer(input: MakeOfferInput): Promise<{ offer: Offer; chatId: string }>;
  /** One offer, e.g. an accepted one before checkout. */
  getOffer(offerId: string): Promise<Offer>;
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
  /** This person has read the chat up to this message. */
  markChatRead(chatId: string, messageId: string): Promise<void>;
  /** Report a listing or a user to the Sahla team. */
  report(input: ReportInput): Promise<void>;
  /** Hide this user's listings and chats; they can't message or offer any more. */
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  getBlockedUsers(): Promise<BlockedUser[]>;
}
