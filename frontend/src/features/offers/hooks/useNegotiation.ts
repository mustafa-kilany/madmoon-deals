// Negotiation, bidding, chat and safety (report, block) as TanStack Query hooks.

import { useMutation, useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import type { OfferStatus } from '@/lib/types';
import { negotiationService } from '@/services/negotiation';
import type {
  MakeOfferInput,
  PlaceBidInput,
  ReportInput,
  SendMessageInput,
} from '@/services/negotiation/types';
import { queryClient, queryKeys } from '@/services/queryClient';

export const useOffer = (offerId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.offer(offerId ?? ''),
    queryFn: () => negotiationService.getOffer(offerId!),
    enabled: !!offerId,
  });

export const useMakeOffer = () =>
  useMutation({
    mutationFn: (input: MakeOfferInput) => negotiationService.makeOffer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });

export const useRespondToOffer = () =>
  useMutation({
    mutationFn: ({
      offerId,
      status,
      counterAmountFils,
    }: {
      offerId: string;
      status: OfferStatus;
      counterAmountFils?: number;
    }) => negotiationService.respondToOffer(offerId, status, counterAmountFils),
    onSuccess: offer => {
      queryClient.setQueryData(queryKeys.offer(offer.id), offer);
      // Threads and every conversation (the answer is posted as a message).
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });

export const useBids = (itemId: string) =>
  useQuery({
    queryKey: ['bids', itemId],
    queryFn: () => negotiationService.getBids(itemId),
    enabled: !!itemId,
    refetchInterval: config.pollMs.auction,
  });

export const usePlaceBid = () =>
  useMutation({
    mutationFn: (input: PlaceBidInput) => negotiationService.placeBid(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bids', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
    },
  });

export const useChatThreads = () =>
  useQuery({
    queryKey: queryKeys.chats,
    queryFn: negotiationService.getChatThreads,
    refetchInterval: config.pollMs.chat,
  });

export const useChatMessages = (chatId: string) =>
  useQuery({
    queryKey: queryKeys.chatMessages(chatId),
    queryFn: () => negotiationService.getChatMessages(chatId),
    enabled: !!chatId,
    refetchInterval: config.pollMs.chat,
  });

export const useSendMessage = () =>
  useMutation({
    mutationFn: (input: SendMessageInput) =>
      negotiationService.sendMessage(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatMessages(variables.chatId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });

export const useReport = () =>
  useMutation({
    mutationFn: (input: ReportInput) => negotiationService.report(input),
  });

export const useBlockedUsers = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.blocked,
    queryFn: negotiationService.getBlockedUsers,
    enabled,
  });

/** Blocking hides their chats and listings: refresh both. */
const afterBlockChange = () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.blocked });
  queryClient.invalidateQueries({ queryKey: queryKeys.chats });
  queryClient.invalidateQueries({ queryKey: queryKeys.items });
};

export const useBlockUser = () =>
  useMutation({
    mutationFn: (userId: string) => negotiationService.blockUser(userId),
    onSuccess: afterBlockChange,
  });

export const useUnblockUser = () =>
  useMutation({
    mutationFn: (userId: string) => negotiationService.unblockUser(userId),
    onSuccess: afterBlockChange,
  });
