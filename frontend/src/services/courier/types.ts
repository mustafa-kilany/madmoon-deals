// What the courier mode needs, whoever answers (mock or API).

import type { FailReason } from '@/lib/deliveryProblems';
import type { Delivery, Order } from '@/lib/types';

export interface CourierService {
  /** The deliveries assigned to me that aren't done, plus today's delivered ones; oldest first. */
  getDeliveries(): Promise<Delivery[]>;
  /** Collected from the seller. */
  markPickedUp(orderId: string): Promise<Delivery>;
  /**
   * The buyer's PIN proves delivery. The server checks it and releases escrow
   * to the seller; a wrong PIN releases nothing, five wrong ones lock it.
   */
  confirmDelivery(orderId: string, pin: string): Promise<Order>;
  /** Can't finish: a reason from the list for where it stopped (B15.4). */
  markFailed(
    orderId: string,
    reason: FailReason,
    note?: string,
  ): Promise<Delivery>;
}
