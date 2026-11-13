// Negotiation, bidding, chat and safety (report, block) as TanStack Query hooks.

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChatThread, OfferStatus } from '@/lib/types';
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

export const useBids = (itemId: string, pollMs: number | false) =>
  useQuery({
    queryKey: ['bids', itemId],
    queryFn: () => negotiationService.getBids(itemId),
    enabled: !!itemId,
    refetchInterval: pollMs,
  });

export const usePlaceBid = () =>
  useMutation({
    mutationFn: (input: PlaceBidInput) => negotiationService.placeBid(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bids', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
    },
  });

export const useChatThreads = ({
  pollMs,
  enabled = true,
}: {
  pollMs: number | false;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: queryKeys.chats,
    queryFn: negotiationService.getChatThreads,
    enabled,
    refetchInterval: pollMs,
  });

/** Every chat's unread messages together: the number on the Chats tab. */
export const totalUnread = (threads: ChatThread[] = []) =>
  threads.reduce((sum, thread) => sum + thread.unreadCount, 0);

export const useChatMessages = (chatId: string, pollMs: number | false) =>
  useQuery({
    queryKey: queryKeys.chatMessages(chatId),
    queryFn: () => negotiationService.getChatMessages(chatId),
    enabled: !!chatId,
    refetchInterval: pollMs,
  });

/** Read up to this message. The count clears at once; the server tells this person's other phones. */
export const useMarkChatRead = () =>
  useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: string; messageId: string }) =>
      negotiationService.markChatRead(chatId, messageId),
    onSuccess: (_, { chatId }) => {
      queryClient.setQueryData<ChatThread[]>(queryKeys.chats, threads =>
        threads?.map(thread =>
          thread.id === chatId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );
    },
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
