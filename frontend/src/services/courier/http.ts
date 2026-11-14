// The courier's deliveries from the Madmoon Deals API (docs/API.md → Couriers).

import type { Delivery, DeliveryFailure, OrderProblem } from '@/lib/types';
import { api } from '../api/client';
import { fromIso, fromIsoMaybe, type Dated } from '../api/wire';
import { toOrder, toProblem, type OrderDto } from '../orders/http';
import type { CourierService } from './types';

type DeliveryDto = Omit<
  Dated<Delivery, 'assignedAt' | 'pickedUpAt' | 'deliveredAt'>,
  'buyerIssue' | 'failed'
> & {
  buyerIssue?: Omit<OrderProblem, 'at'> & { at: string };
  failed?: Omit<DeliveryFailure, 'at'> & { at: string };
};

const toDelivery = (d: DeliveryDto): Delivery => ({
  ...d,
  assignedAt: fromIso(d.assignedAt),
  pickedUpAt: fromIsoMaybe(d.pickedUpAt),
  deliveredAt: fromIsoMaybe(d.deliveredAt),
  buyerIssue: toProblem<OrderProblem>(d.buyerIssue),
  failed: toProblem<DeliveryFailure>(d.failed),
});

export const httpCourierService: CourierService = {
  getDeliveries: async () =>
    (await api.get<DeliveryDto[]>('/courier/deliveries')).map(toDelivery),
  markPickedUp: async orderId =>
    toDelivery(
      await api.post<DeliveryDto>(
        `/courier/deliveries/${encodeURIComponent(orderId)}/picked-up`,
      ),
    ),
  confirmDelivery: async (orderId, pin) =>
    toOrder(
      await api.post<OrderDto>('/courier/confirm-delivery', { orderId, pin }),
    ),
  markFailed: async (orderId, reason, note) =>
    toDelivery(
      await api.post<DeliveryDto>(
        `/courier/deliveries/${encodeURIComponent(orderId)}/failed`,
        { reason, note },
      ),
    ),
};
