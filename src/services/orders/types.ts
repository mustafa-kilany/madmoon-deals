// What the app needs for checkout and orders, whoever answers (mock or API).

import type { DeliveryDetails, Order } from '@/lib/types';

export type CreateOrderInput = {
  listingId: string;
  offerId?: string;
  delivery: DeliveryDetails;
};

export interface OrdersService {
  /** Start a purchase; the server prices it (item + protection + delivery). */
  createOrder(input: CreateOrderInput): Promise<Order>;
  /**
   * Pay with the payment provider's card token; money goes into escrow. If
   * the bank wants its card check, the order comes back still
   * awaiting_payment with a paymentUrl to open.
   */
  payOrder(orderId: string, cardToken: string): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  /** The signed-in buyer's orders, newest first. */
  getMyOrders(): Promise<Order[]>;
  /**
   * Courier: the buyer's PIN proves delivery. The server checks it and
   * releases escrow to the seller; a wrong PIN releases nothing.
   */
  confirmDelivery(orderId: string, pin: string): Promise<Order>;
}
