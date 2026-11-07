// The courier's deliveries answered by the in-app mock backend. The mock has
// one courier (courier@sahla.jo), so every paid mock order is theirs. Same
// rules as the API: courier accounts only, picked up once, the buyer's PIN
// completes the order, five wrong PINs lock it.

import { useSessionStore } from '@/features/auth/sessionStore';
import { failReasonsFor } from '@/lib/deliveryProblems';
import type { CourierStatus, Delivery } from '@/lib/types';
import { ApiError } from '../api/errors';
import { mockLatency } from '../mock/delay';
import { findItem } from '../mock/marketplace';
import { orders, publicOrder, type MockOrder } from '../orders/mock';
import type { CourierService } from './types';

export const PIN_TRIES = 5;

/** What the server keeps per order for the courier. */
const progress = new Map<
  string,
  {
    status: CourierStatus;
    pickedUpAt?: number;
    pinAttempts: number;
    failed?: Delivery['failed'];
  }
>();
const progressOf = (orderId: string) => {
  let row = progress.get(orderId);
  if (!row)
    progress.set(orderId, (row = { status: 'to_pickup', pinAttempts: 0 }));
  return row;
};

const startOfToday = () => new Date().setHours(0, 0, 0, 0);

function requireCourier() {
  if (useSessionStore.getState().user?.role !== 'courier')
    throw new ApiError('FORBIDDEN', 'Courier accounts only', 403);
}

/** Paid orders waiting for a courier, or delivered (escrow released). */
const findDelivery = (orderId: string) => {
  const order = orders.find(
    o => o.id.toUpperCase() === orderId.trim().toUpperCase(),
  );
  if (
    !order ||
    order.status === 'awaiting_payment' ||
    order.status === 'refunded'
  )
    throw new ApiError('NOT_FOUND', `No delivery ${orderId}`, 404);
  return order;
};

const toDelivery = (order: MockOrder): Delivery => {
  const item = findItem(order.itemId);
  const { status, pickedUpAt } = progressOf(order.id);
  return {
    orderId: order.id,
    status,
    itemTitle: order.itemTitle,
    itemImageUrl: order.itemImageUrl,
    // Demo sellers have a made-up pickup address, as if given with the listing.
    pickup: {
      name: item.seller.en,
      phone: '0795550123',
      cityId: item.location.id,
      address: 'Building 7, ground floor (demo address)',
    },
    dropoff: { ...order.delivery },
    assignedAt: order.createdAt,
    pickedUpAt,
    deliveredAt: order.deliveredAt,
    buyerIssue: order.itemIssue,
    failed: progressOf(order.id).failed,
  };
};

export const mockCourierService: CourierService = {
  getDeliveries: async () => {
    await mockLatency();
    requireCourier();
    const today = startOfToday();
    return orders
      .filter(
        o =>
          o.status === 'escrow_held' ||
          (o.status === 'completed' && (o.deliveredAt ?? 0) >= today),
      )
      .map(toDelivery)
      .sort((a, b) => a.assignedAt - b.assignedAt);
  },

  markPickedUp: async orderId => {
    await mockLatency();
    requireCourier();
    const order = findDelivery(orderId);
    const row = progressOf(order.id);
    if (order.status !== 'escrow_held' || row.status !== 'to_pickup')
      throw new ApiError('VALIDATION', `This delivery is ${row.status}`, 422);
    row.status = 'picked_up';
    order.courierStatus = 'picked_up';
    row.pickedUpAt = Date.now();
    return toDelivery(order);
  },

  confirmDelivery: async (orderId, pin) => {
    await mockLatency();
    requireCourier();
    const order = findDelivery(orderId);
    if (order.status !== 'escrow_held')
      throw new ApiError('VALIDATION', 'Order is not awaiting delivery', 422);
    const row = progressOf(order.id);
    if (row.pinAttempts >= PIN_TRIES)
      throw new ApiError('RATE_LIMITED', 'Locked after 5 wrong PINs', 429);
    row.pinAttempts += 1;
    if (order.pin !== pin.trim())
      throw new ApiError('INVALID_PIN', 'Wrong delivery PIN', 422);
    order.status = 'completed';
    order.deliveredAt = Date.now();
    row.status = 'delivered';
    findItem(order.itemId).status = 'sold';
    return publicOrder(order);
  },

  markFailed: async (orderId, reason, note) => {
    await mockLatency();
    requireCourier();
    const order = findDelivery(orderId);
    const row = progressOf(order.id);
    if (
      order.status !== 'escrow_held' ||
      !['to_pickup', 'picked_up'].includes(row.status)
    )
      throw new ApiError('VALIDATION', `This delivery is ${row.status}`, 422);
    const stage = row.status === 'to_pickup' ? 'pickup' : 'dropoff';
    if (!failReasonsFor(stage).includes(reason))
      throw new ApiError('VALIDATION', 'reason: not for this stage', 422);
    row.status = 'failed';
    row.failed = { stage, reason, note, at: Date.now() };
    order.courierStatus = 'failed';
    order.deliveryFailed = row.failed;
    return toDelivery(order);
  },
};
