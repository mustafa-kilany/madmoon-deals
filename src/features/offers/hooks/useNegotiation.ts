// Negotiation & bidding TanStack Query hooks for Phase 5.

import { useMutation, useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import type { OfferStatus } from '@/lib/types';
import { negotiationService } from '@/services/negotiation';
import type {
  MakeOfferInput,
  PlaceBidInput,
  SendMessageInput,
} from '@/services/negotiation/types';
import { queryClient, queryKeys } from '@/services/queryClient';

export const useOffer = (offerId: string | undefined) =>
  useQuery({
    queryKey: ['offers', offerId],
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
    onSuccess: () => {
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
    queryKey: ['chatMessages', chatId],
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
        queryKey: ['chatMessages', variables.chatId],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });
