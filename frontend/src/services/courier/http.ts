// The courier's deliveries from the Sahla API (docs/API.md → Couriers).

import type { Delivery } from '@/lib/types';
import { api } from '../api/client';
import { fromIso, fromIsoMaybe, type Dated } from '../api/wire';
import { toOrder, type OrderDto } from '../orders/http';
import type { CourierService } from './types';

type DeliveryDto = Dated<Delivery, 'assignedAt' | 'pickedUpAt' | 'deliveredAt'>;

const toDelivery = (d: DeliveryDto): Delivery => ({
  ...d,
  assignedAt: fromIso(d.assignedAt),
  pickedUpAt: fromIsoMaybe(d.pickedUpAt),
  deliveredAt: fromIsoMaybe(d.deliveredAt),
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
};
