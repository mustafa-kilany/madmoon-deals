// Orders answered by the in-app mock backend (in memory, like negotiation).

import { calculateCheckoutBreakdown } from '@/lib/money';
import type { Order } from '@/lib/types';
import { ApiError } from '../api/errors';
import { buildItems } from '../mock/catalog';
import { mockLatency } from '../mock/delay';
import type { OrdersService } from './types';

const catalogItems = buildItems(Date.now());
const orders: Order[] = [];

const find = (orderId: string) => {
  const order = orders.find(o => o.id === orderId);
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found', 404);
  return order;
};

export const mockOrdersService: OrdersService = {
  createOrder: async ({ listingId }) => {
    await mockLatency();
    const item = catalogItems.find(i => i.id === listingId);
    if (!item) throw new ApiError('NOT_FOUND', 'Listing not found', 404);
    const order: Order = {
      id: `ord-${Date.now()}-${orders.length}`,
      itemId: item.id,
      itemTitle: item.title,
      itemImageUrl: item.imageUrl,
      ...calculateCheckoutBreakdown(item.priceFils),
      status: 'awaiting_payment',
      createdAt: Date.now(),
    };
    orders.unshift(order);
    return { ...order };
  },

  payOrder: async (orderId, cardToken) => {
    await mockLatency();
    const order = find(orderId);
    if (!cardToken)
      throw new ApiError('VALIDATION', 'Card token required', 422);
    if (order.status !== 'awaiting_payment')
      throw new ApiError('VALIDATION', 'Order is not awaiting payment', 422);
    order.status = 'escrow_held';
    order.pin = String(1000 + Math.floor(Math.random() * 9000));
    return { ...order };
  },

  getOrder: async orderId => {
    await mockLatency();
    return { ...find(orderId) };
  },

  getMyOrders: async () => {
    await mockLatency();
    return orders.map(o => ({ ...o }));
  },
};
