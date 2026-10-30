// Orders from the Sahla API (docs/API.md → Checkout, Orders & Escrow).

import type { Order } from '@/lib/types';
import { api } from '../api/client';
import { fromIso, fromIsoMaybe, type Dated } from '../api/wire';
import type { OrdersService } from './types';

type OrderDto = Dated<Order, 'createdAt' | 'deliveredAt'>;

const toOrder = (o: OrderDto): Order => ({
  ...o,
  createdAt: fromIso(o.createdAt),
  deliveredAt: fromIsoMaybe(o.deliveredAt),
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
  confirmDelivery: async (orderId, pin) =>
    toOrder(
      await api.post<OrderDto>('/courier/confirm-delivery', { orderId, pin }),
    ),
};
