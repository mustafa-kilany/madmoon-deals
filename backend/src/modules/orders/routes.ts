import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { deliveryDetails } from './delivery';
import { createOrder } from './orders';
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
