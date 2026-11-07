// Orders answered by the in-app mock backend (in memory, like negotiation).
// Same rules as the API: delivery details required, nobody buys their own
// listing, a listing sells once (paid → reserved, delivered → sold), an ended
// auction only to its winner, at the winning bid.

import { deliveryProblems, normalizeJordanMobile } from '@/lib/delivery';
import { calculateCheckoutBreakdown } from '@/lib/money';
import type { Order } from '@/lib/types';
import { ApiError } from '../api/errors';
import { mockLatency } from '../mock/delay';
import { blocked, findItem, me, publicItem } from '../mock/marketplace';
import { findMockOffer } from '../negotiation/mock';
import type { OrdersService } from './types';

export type MockOrder = Order & { buyerId: string };

/** Orders with who bought them (the API keeps that server-side). The courier mock reads them too. */
export const orders: MockOrder[] = [];

/** Short, readable order numbers the buyer can read out to the courier. */
const nextOrderNumber = () =>
  `SA-${String(100000 + orders.length * 7919 + (Date.now() % 1000)).slice(-6)}`;

const find = (orderId: string) => {
  const order = orders.find(o => o.id === orderId);
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found', 404);
  return order;
};

export const publicOrder = ({
  buyerId: _buyerId,
  ...order
}: MockOrder): Order => ({
  ...order,
  delivery: { ...order.delivery },
});

export const mockOrdersService: OrdersService = {
  createOrder: async ({ listingId, offerId, delivery }) => {
    await mockLatency();
    const problems = deliveryProblems(delivery);
    if (problems.length)
      throw new ApiError('VALIDATION', `delivery: ${problems.join(', ')}`, 422);
    const item = findItem(listingId);
    const buyer = me();
    if (item.sellerId === buyer.id)
      throw new ApiError('FORBIDDEN', 'Your own listing', 403);
    if (item.status !== 'active' || blocked.has(item.sellerId))
      throw new ApiError('ITEM_UNAVAILABLE', 'No longer for sale', 409);

    let priceFils = item.priceFils;
    if (item.auction) {
      // A running auction can't be bought; an ended one only by its winner.
      if (publicItem(item).auction?.winnerId !== buyer.id)
        throw new ApiError('ITEM_UNAVAILABLE', 'Auction not won', 409);
    } else if (offerId) {
      // An accepted offer by this buyer on this listing sets the price.
      const offer = findMockOffer(offerId);
      if (
        !offer ||
        offer.itemId !== listingId ||
        offer.buyerId !== buyer.id ||
        offer.status !== 'accepted'
      )
        throw new ApiError('VALIDATION', 'Offer is not accepted', 422);
      priceFils = offer.amountFils;
    }

    const order = {
      id: nextOrderNumber(),
      buyerId: buyer.id,
      itemId: item.id,
      itemTitle: item.title,
      itemImageUrl: item.imageUrl,
      ...calculateCheckoutBreakdown(priceFils),
      offerId,
      delivery: {
        ...delivery,
        name: delivery.name.trim(),
        phone: normalizeJordanMobile(delivery.phone)!,
        address: delivery.address.trim(),
        notes: delivery.notes?.trim() || undefined,
      },
      status: 'awaiting_payment' as const,
      createdAt: Date.now(),
    };
    orders.unshift(order);
    return publicOrder(order);
  },

  // The mock bank never asks for its card check, so there is no paymentUrl.
  payOrder: async (orderId, cardToken) => {
    await mockLatency();
    const order = find(orderId);
    if (order.buyerId !== me().id)
      throw new ApiError('FORBIDDEN', 'Not your order', 403);
    if (!cardToken)
      throw new ApiError('VALIDATION', 'Card token required', 422);
    if (order.status !== 'awaiting_payment')
      throw new ApiError('VALIDATION', 'Order is not awaiting payment', 422);
    // First to pay wins: someone else may have bought it meanwhile.
    const item = findItem(order.itemId);
    if (item.status !== 'active')
      throw new ApiError('ITEM_UNAVAILABLE', 'No longer for sale', 409);
    item.status = 'reserved';
    order.status = 'escrow_held';
    order.pin = String(1000 + Math.floor(Math.random() * 9000));
    return publicOrder(order);
  },

  getOrder: async orderId => {
    await mockLatency();
    return publicOrder(find(orderId));
  },

  getMyOrders: async () => {
    await mockLatency();
    const buyer = me().id;
    return orders.filter(o => o.buyerId === buyer).map(publicOrder);
  },

  getMySales: async () => {
    await mockLatency();
    const seller = me().id;
    return orders
      .filter(
        o =>
          o.status !== 'awaiting_payment' &&
          findItem(o.itemId).sellerId === seller,
      )
      .map(publicOrder);
  },

  cancelOrder: async (orderId, reason, note) => {
    await mockLatency();
    const order = find(orderId);
    if (order.buyerId !== me().id)
      throw new ApiError('NOT_FOUND', 'Order not found', 404);
    if (
      !['awaiting_payment', 'escrow_held'].includes(order.status) ||
      (order.courierStatus && order.courierStatus !== 'to_pickup')
    )
      throw new ApiError('VALIDATION', 'Too late to cancel', 422);
    if (order.status === 'escrow_held') {
      findItem(order.itemId).status = 'active';
      order.refundedAt = Date.now();
    }
    order.status = 'cancelled';
    order.pin = undefined;
    order.cancel = { reason, note, at: Date.now() };
    return publicOrder(order);
  },

  reportItemIssue: async (orderId, reason, note) => {
    await mockLatency();
    const order = find(orderId);
    if (order.buyerId !== me().id)
      throw new ApiError('NOT_FOUND', 'Order not found', 404);
    if (order.status !== 'escrow_held' || order.courierStatus !== 'picked_up')
      throw new ApiError(
        'VALIDATION',
        'Only when the driver has the item',
        422,
      );
    order.itemIssue = { reason, note, at: Date.now() };
    return publicOrder(order);
  },
};
