// The courier's deliveries as TanStack Query hooks. The list re-asks the
// server while it's open, so newly assigned orders appear by themselves.

import { useMutation, useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import type { Delivery } from '@/lib/types';
import { courierService } from '@/services/courier';
import { queryClient, queryKeys } from '@/services/queryClient';

export const useDeliveries = () =>
  useQuery({
    queryKey: queryKeys.deliveries,
    queryFn: courierService.getDeliveries,
    refetchInterval: config.pollMs.deliveries,
  });

/** One delivery, from the list. */
export const useDelivery = (orderId: string) => {
  const query = useDeliveries();
  return { ...query, data: query.data?.find(d => d.orderId === orderId) };
};

const replace = (delivery: Delivery) =>
  queryClient.setQueryData<Delivery[]>(queryKeys.deliveries, list =>
    list?.map(d => (d.orderId === delivery.orderId ? delivery : d)),
  );

export const useMarkPickedUp = () =>
  useMutation({
    mutationFn: courierService.markPickedUp,
    onSuccess: replace,
  });

/** The buyer's PIN → the server releases escrow. */
export const useConfirmDelivery = () =>
  useMutation({
    mutationFn: (input: { orderId: string; pin: string }) =>
      courierService.confirmDelivery(input.orderId, input.pin),
    onSuccess: order => {
      queryClient.setQueryData<Delivery[]>(queryKeys.deliveries, list =>
        list?.map(d =>
          d.orderId === order.id
            ? { ...d, status: 'delivered', deliveredAt: order.deliveredAt }
            : d,
        ),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveries });
    },
  });
