// Orders from the Sahla API (docs/API.md → Checkout, Orders & Escrow).

import type { Order } from '@/lib/types';
import { api } from '../api/client';
import type { OrdersService } from './types';

export const httpOrdersService: OrdersService = {
  createOrder: input => api.post<Order>('/orders', input),
  payOrder: (orderId, cardToken) =>
    api.post<Order>(`/orders/${encodeURIComponent(orderId)}/pay`, {
      cardToken,
    }),
  getOrder: orderId => api.get<Order>(`/orders/${encodeURIComponent(orderId)}`),
  getMyOrders: () => api.get<Order[]>('/me/orders'),
  confirmDelivery: (orderId, pin) =>
    api.post<Order>('/courier/confirm-delivery', { orderId, pin }),
};
