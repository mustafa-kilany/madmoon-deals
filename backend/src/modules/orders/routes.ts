import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { publicUrl } from '../../lib/publicUrl';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { deliveryDetails } from './delivery';
import { createOrder, getOrder, listMyOrders, listMySales, setPickup } from './orders';
import { payOrder } from './pay';
import { toApiOrder, toApiSale } from './shapes';

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

// cardToken: the payment provider's token from the app's card field, or "saved"
// for the account's saved card (POST /me/payment-card).
orderRoutes.post('/orders/:id/pay', ...requireCustomer, async (req, res) => {
  const { cardToken } = z.object({ cardToken: z.string().min(1).max(500) }).parse(req.body);
  const me = currentUser(res.locals);
  const token = cardToken === 'saved' ? me.cardToken : cardToken;
  if (!token) throw new ApiError(422, 'VALIDATION', 'cardToken: no saved card on this account');
  const returnUrl = publicUrl(req, '/v1/payments/callback');
  const order = await payOrder(me.id, req.params.id as string, token, returnUrl);
  res.json(toApiOrder(order, req));
});

orderRoutes.get('/me/orders', ...requireCustomer, async (req, res) => {
  res.json((await listMyOrders(currentUser(res.locals).id)).map(order => toApiOrder(order, req)));
});

orderRoutes.get('/me/sales', ...requireCustomer, async (req, res) => {
  res.json((await listMySales(currentUser(res.locals).id)).map(order => toApiSale(order, req)));
});

// The buyer sees the PIN; the seller sees the sale (no PIN, no phone or address).
orderRoutes.get('/orders/:id', ...requireCustomer, async (req, res) => {
  const { order, role } = await getOrder(currentUser(res.locals).id, req.params.id as string);
  res.json(role === 'buyer' ? toApiOrder(order, req) : toApiSale(order, req));
});

// The seller's pickup address for the courier (B14.5).
orderRoutes.post('/orders/:id/pickup', ...requireCustomer, async (req, res) => {
  const order = await setPickup(currentUser(res.locals).id, req.params.id as string, deliveryDetails.parse(req.body));
  res.json(toApiSale(order, req));
});
