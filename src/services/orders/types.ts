// What the app needs for checkout and orders, whoever answers (mock or API).

import type { Order } from '@/lib/types';

export type CreateOrderInput = { listingId: string; offerId?: string };

export interface OrdersService {
  /** Start a purchase; the server prices it (item + protection + delivery). */
  createOrder(input: CreateOrderInput): Promise<Order>;
  /** Pay with the payment provider's card token; money goes into escrow. */
  payOrder(orderId: string, cardToken: string): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  /** The signed-in buyer's orders, newest first. */
  getMyOrders(): Promise<Order[]>;
}
