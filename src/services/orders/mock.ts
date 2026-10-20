// Orders answered by the in-app mock backend (in memory, like negotiation).

import { calculateCheckoutBreakdown } from '@/lib/money';
import type { Order } from '@/lib/types';
import { ApiError } from '../api/errors';
import { buildItems } from '../mock/catalog';
import { mockLatency } from '../mock/delay';
import { findMockOffer } from '../negotiation/mock';
import type { OrdersService } from './types';

const catalogItems = buildItems(Date.now());
const orders: Order[] = [];

/** Short, readable order numbers the buyer can read out to the courier. */
const nextOrderNumber = () =>
  `SA-${String(100000 + orders.length * 7919 + (Date.now() % 1000)).slice(-6)}`;

const find = (orderId: string) => {
  const order = orders.find(o => o.id === orderId);
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found', 404);
  return order;
};

export const mockOrdersService: OrdersService = {
  createOrder: async ({ listingId, offerId }) => {
    await mockLatency();
    const item = catalogItems.find(i => i.id === listingId);
    if (!item) throw new ApiError('NOT_FOUND', 'Listing not found', 404);
    // An accepted offer on this listing sets the price; anything else is refused.
    let priceFils = item.priceFils;
    if (offerId) {
      const offer = findMockOffer(offerId);
      if (!offer || offer.itemId !== listingId || offer.status !== 'accepted')
        throw new ApiError('VALIDATION', 'Offer is not accepted', 422);
      priceFils = offer.amountFils;
    }
    const order: Order = {
      id: nextOrderNumber(),
      itemId: item.id,
      itemTitle: item.title,
      itemImageUrl: item.imageUrl,
      ...calculateCheckoutBreakdown(priceFils),
      offerId,
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

  confirmDelivery: async (orderId, pin) => {
    await mockLatency();
    const order = orders.find(
      o => o.id.toUpperCase() === orderId.trim().toUpperCase(),
    );
    if (!order) throw new ApiError('NOT_FOUND', 'Order not found', 404);
    if (order.status !== 'escrow_held')
      throw new ApiError('VALIDATION', 'Order is not awaiting delivery', 422);
    if (order.pin !== pin.trim())
      throw new ApiError('INVALID_PIN', 'Wrong delivery PIN', 422);
    order.status = 'completed';
    order.deliveredAt = Date.now();
    return { ...order };
  },
};
