import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireCourier } from '../auth/requireUser';
import { toApiOrder } from '../orders/shapes';
import { listDeliveries, markPickedUp, toApiDelivery } from './deliveries';
import { confirmDelivery } from './delivery';

// docs/API.md → Couriers (BACKEND_PLAN B7.6, B14). Courier accounts only.

export const courierRoutes = Router();

courierRoutes.post('/courier/confirm-delivery', ...requireCourier, async (req, res) => {
  const { orderId, pin } = z
    .object({ orderId: z.string().trim().toUpperCase().min(1).max(20), pin: z.string().regex(/^\d{4}$/, '4 digits') })
    .parse(req.body);
  res.json(toApiOrder(await confirmDelivery(currentUser(res.locals).id, orderId, pin), req));
});

courierRoutes.get('/courier/deliveries', ...requireCourier, async (req, res) => {
  res.json((await listDeliveries(currentUser(res.locals).id)).map(order => toApiDelivery(order, req)));
});

courierRoutes.post('/courier/deliveries/:orderId/picked-up', ...requireCourier, async (req, res) => {
  const orderId = (req.params.orderId as string).toUpperCase();
  res.json(toApiDelivery(await markPickedUp(currentUser(res.locals).id, orderId), req));
});
