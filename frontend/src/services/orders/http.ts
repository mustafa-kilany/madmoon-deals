// Orders from the Sahla API (docs/API.md → Checkout, Orders & Escrow).

import type { DeliveryFailure, Order, OrderProblem } from '@/lib/types';
import { api } from '../api/client';
import { fromIso, fromIsoMaybe, type Dated } from '../api/wire';
import type { OrdersService } from './types';

type ProblemDto<T extends { at: number }> = Omit<T, 'at'> & { at: string };
export type OrderDto = Omit<
  Dated<Order, 'createdAt' | 'deliveredAt' | 'refundedAt'>,
  'cancel' | 'itemIssue' | 'deliveryFailed'
> & {
  cancel?: ProblemDto<OrderProblem>;
  itemIssue?: ProblemDto<OrderProblem>;
  deliveryFailed?: ProblemDto<DeliveryFailure>;
};

export const toProblem = <T extends { at: number }>(
  p: ProblemDto<T> | undefined,
): T | undefined =>
  p ? ({ ...p, at: fromIso(p.at) } as unknown as T) : undefined;

export const toOrder = (o: OrderDto): Order => ({
  ...o,
  createdAt: fromIso(o.createdAt),
  deliveredAt: fromIsoMaybe(o.deliveredAt),
  refundedAt: fromIsoMaybe(o.refundedAt),
  cancel: toProblem<OrderProblem>(o.cancel),
  itemIssue: toProblem<OrderProblem>(o.itemIssue),
  deliveryFailed: toProblem<DeliveryFailure>(o.deliveryFailed),
});

const orderPath = (orderId: string) => `/orders/${encodeURIComponent(orderId)}`;

export const httpOrdersService: OrdersService = {
  createOrder: async input =>
    toOrder(await api.post<OrderDto>('/orders', input)),
  payOrder: async (orderId, cardToken) =>
    toOrder(
      await api.post<OrderDto>(`${orderPath(orderId)}/pay`, { cardToken }),
    ),
  getOrder: async orderId =>
    toOrder(await api.get<OrderDto>(orderPath(orderId))),
  getMyOrders: async () =>
    (await api.get<OrderDto[]>('/me/orders')).map(toOrder),
  cancelOrder: async (orderId, reason, note) =>
    toOrder(
      await api.post<OrderDto>(`${orderPath(orderId)}/cancel`, {
        reason,
        note,
      }),
    ),
  reportItemIssue: async (orderId, reason, note) =>
    toOrder(
      await api.post<OrderDto>(`${orderPath(orderId)}/problem`, {
        reason,
        note,
      }),
    ),
};
