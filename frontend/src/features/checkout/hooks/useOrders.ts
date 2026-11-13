// Checkout and order tracking as TanStack Query hooks.

import { useMutation, useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import type { CancelReason, ItemIssueReason } from '@/lib/deliveryProblems';
import { ordersService, type CreateOrderInput } from '@/services/orders';
import { queryClient, queryKeys } from '@/services/queryClient';

export const useCreateOrder = () =>
  useMutation({
    mutationFn: (input: CreateOrderInput) => ordersService.createOrder(input),
  });

export const usePayOrder = () =>
  useMutation({
    mutationFn: (input: { orderId: string; cardToken: string }) =>
      ordersService.payOrder(input.orderId, input.cardToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      // The listing is now reserved.
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
    },
  });

type ProblemInput<R> = { orderId: string; reason: R; note?: string };

/** B15.3: cancel before pickup; the listing goes back on sale. */
export const useCancelOrder = () =>
  useMutation({
    mutationFn: ({ orderId, reason, note }: ProblemInput<CancelReason>) =>
      ordersService.cancelOrder(orderId, reason, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
    },
  });

/** B15.4: a problem with the item, at the door. */
export const useReportItemIssue = () =>
  useMutation({
    mutationFn: ({ orderId, reason, note }: ProblemInput<ItemIssueReason>) =>
      ordersService.reportItemIssue(orderId, reason, note),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.orders }),
  });

/** B15.9: what I sold; re-asked like the buyer's orders. */
export const useMySales = () =>
  useQuery({
    queryKey: [...queryKeys.orders, 'sales'],
    queryFn: ordersService.getMySales,
    refetchInterval: config.pollMs.orders,
  });

export const useMyOrders = () =>
  useQuery({
    queryKey: queryKeys.orders,
    queryFn: ordersService.getMyOrders,
    // Picks up "delivered" once the courier confirms the PIN.
    refetchInterval: config.pollMs.orders,
  });
