import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { listBids, placeBid } from './bids';
import { listChats, listMessages, markChatRead, MESSAGE_MAX, sendMessage, unreadCounts } from './chats';
import { getOffer, makeOffer, respondToOffer } from './offers';
import { toApiBid, toApiMessage, toApiOffer, toApiThread } from './shapes';
import { LIMITS } from '../../lib/rateLimit';

// docs/API.md → Phase 5: Negotiation, Chat & Auction Bids (BACKEND_PLAN B6).

export const negotiationRoutes = Router();

const fils = z.number().int().positive().max(1_000_000_000);
const id = (value: unknown) => value as string;

negotiationRoutes.get('/chats', ...requireCustomer, async (req, res) => {
  const me = currentUser(res.locals).id;
  const chats = await listChats(me);
  const unread = await unreadCounts(me, chats.map(chat => chat.id));
  res.json(chats.map(chat => toApiThread(chat, me, req, unread.get(chat.id) ?? 0)));
});

negotiationRoutes.get('/chats/:id/messages', ...requireCustomer, async (req, res) => {
  const { before, limit } = z
    .object({ before: z.string().optional(), limit: z.coerce.number().int().optional() })
    .parse(req.query);
  const messages = await listMessages(currentUser(res.locals).id, id(req.params.id), before, limit);
  res.json(messages.map(m => toApiMessage(m, req)));
});

negotiationRoutes.post('/chats/:id/messages', ...requireCustomer, ...LIMITS.chatMessage, async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(MESSAGE_MAX) }).parse(req.body);
  res.status(201).json(toApiMessage(await sendMessage(currentUser(res.locals).id, id(req.params.id), text), req));
});

negotiationRoutes.post('/chats/:id/read', ...requireCustomer, ...LIMITS.chatRead, async (req, res) => {
  const { messageId } = z.object({ messageId: z.string().min(1).max(64) }).parse(req.body);
  await markChatRead(currentUser(res.locals).id, id(req.params.id), messageId);
  res.status(204).end();
});

negotiationRoutes.post('/listings/:id/offers', ...requireCustomer, ...LIMITS.offer, async (req, res) => {
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

negotiationRoutes.post('/listings/:id/bids', ...requireCustomer, ...LIMITS.bid, async (req, res) => {
  const { amountFils } = z.object({ amountFils: fils }).parse(req.body);
  res.status(201).json(toApiBid(await placeBid(currentUser(res.locals).id, id(req.params.id), amountFils)));
});

// Anyone can see an auction's bids.
negotiationRoutes.get('/listings/:id/bids', async (req, res) => {
  res.json((await listBids(id(req.params.id))).map(toApiBid));
});
