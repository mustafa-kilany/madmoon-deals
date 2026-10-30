import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { listChats, listMessages, MESSAGE_MAX, sendMessage } from './chats';
import { getOffer, makeOffer, respondToOffer } from './offers';
import { toApiMessage, toApiOffer, toApiThread } from './shapes';

// docs/API.md → Phase 5: Negotiation, Chat & Auction Bids (BACKEND_PLAN B6).

export const negotiationRoutes = Router();

const fils = z.number().int().positive().max(1_000_000_000);
const id = (value: unknown) => value as string;

negotiationRoutes.get('/chats', ...requireCustomer, async (req, res) => {
  const me = currentUser(res.locals).id;
  res.json((await listChats(me)).map(chat => toApiThread(chat, me, req)));
});

negotiationRoutes.get('/chats/:id/messages', ...requireCustomer, async (req, res) => {
  const { before, limit } = z
    .object({ before: z.string().optional(), limit: z.coerce.number().int().optional() })
    .parse(req.query);
  const messages = await listMessages(currentUser(res.locals).id, id(req.params.id), before, limit);
  res.json(messages.map(m => toApiMessage(m, req)));
});

negotiationRoutes.post('/chats/:id/messages', ...requireCustomer, async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(MESSAGE_MAX) }).parse(req.body);
  res.status(201).json(toApiMessage(await sendMessage(currentUser(res.locals).id, id(req.params.id), text), req));
});

negotiationRoutes.post('/listings/:id/offers', ...requireCustomer, async (req, res) => {
  const { amountFils } = z.object({ amountFils: fils }).parse(req.body);
  const { offer, chatId } = await makeOffer(currentUser(res.locals).id, id(req.params.id), amountFils);
  res.status(201).json({ offer: toApiOffer(offer, req), chatId });
});

negotiationRoutes.get('/offers/:id', ...requireCustomer, async (req, res) => {
  res.json(toApiOffer(await getOffer(currentUser(res.locals).id, id(req.params.id)), req));
});

negotiationRoutes.post('/offers/:id/respond', ...requireCustomer, async (req, res) => {
  const answer = z
    .object({ status: z.enum(['accepted', 'countered', 'rejected']), counterAmountFils: fils.optional() })
    .parse(req.body);
  res.json(toApiOffer(await respondToOffer(currentUser(res.locals).id, id(req.params.id), answer), req));
});
