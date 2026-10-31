import { Router } from 'express';
import { z } from 'zod';
import { publicUrl } from '../../lib/publicUrl';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { deliveryDetails } from './delivery';
import { createOrder } from './orders';
import { payOrder } from './pay';
import { toApiOrder } from './shapes';

// docs/API.md → Phase 6: Checkout, Orders & Escrow (BACKEND_PLAN B7).

export const orderRoutes = Router();

const newOrder = z.object({
  listingId: z.string().min(1),
  offerId: z.string().min(1).optional(),
  delivery: deliveryDetails,
});

orderRoutes.post('/orders', ...requireCustomer, async (req, res) => {
  const order = await createOrder(currentUser(res.locals).id, newOrder.parse(req.body));
  res.status(201).json(toApiOrder(order, req));
});

// cardToken: the payment provider's token from the app's card field.
orderRoutes.post('/orders/:id/pay', ...requireCustomer, async (req, res) => {
  const { cardToken } = z.object({ cardToken: z.string().min(1).max(500) }).parse(req.body);
  const returnUrl = publicUrl(req, '/v1/payments/callback');
  const order = await payOrder(currentUser(res.locals).id, req.params.id as string, cardToken, returnUrl);
  res.json(toApiOrder(order, req));
});
