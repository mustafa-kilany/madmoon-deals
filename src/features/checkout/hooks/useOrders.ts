// Checkout and order tracking as TanStack Query hooks.

import { useMutation, useQuery } from '@tanstack/react-query';
import { config } from '@/config';
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
    },
  });

export const useMyOrders = () =>
  useQuery({
    queryKey: queryKeys.orders,
    queryFn: ordersService.getMyOrders,
    // Picks up "delivered" once the courier confirms the PIN.
    refetchInterval: config.pollMs.orders,
  });

/** Courier: buyer's PIN → server releases escrow. */
export const useConfirmDelivery = () =>
  useMutation({
    mutationFn: (input: { orderId: string; pin: string }) =>
      ordersService.confirmDelivery(input.orderId, input.pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
