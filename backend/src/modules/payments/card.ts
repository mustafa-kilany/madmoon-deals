import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { toApiUser } from '../auth/apiUser';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { provider } from '../orders/pay';
import { LIMITS } from '../../lib/rateLimit';

// The saved card (BACKEND_PLAN B7.8), docs/API.md → POST/DELETE /me/payment-card.
// The app's provider SDK turns the card into a one-time token; the provider swaps
// it for one that can be charged again ("saved" at checkout). Only that token and
// the brand / last 4 digits are kept, never the card number.

export const cardRoutes = Router();

cardRoutes.post('/me/payment-card', ...requireCustomer, ...LIMITS.card, async (req, res) => {
  const { cardToken } = z.object({ cardToken: z.string().min(1).max(500) }).parse(req.body);
  const me = currentUser(res.locals);
  const card = await provider().saveCard(cardToken);
  if (me.cardToken && me.cardToken !== card.token) await provider().deleteCard(me.cardToken);
  const user = await prisma.user.update({
    where: { id: me.id },
    data: { cardToken: card.token, cardBrand: card.brand, cardLast4: card.last4 },
  });
  res.json(toApiUser(user, req));
});

cardRoutes.delete('/me/payment-card', ...requireCustomer, async (req, res) => {
  const me = currentUser(res.locals);
  if (me.cardToken) await provider().deleteCard(me.cardToken);
  const user = await prisma.user.update({
    where: { id: me.id },
    data: { cardToken: null, cardBrand: null, cardLast4: null },
  });
  res.json(toApiUser(user, req));
});
