// Checkout and order tracking as TanStack Query hooks.

import { useMutation, useQuery } from '@tanstack/react-query';
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
  });
