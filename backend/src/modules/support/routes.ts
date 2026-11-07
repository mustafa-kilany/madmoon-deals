import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { env } from '../../env';
import { ApiError } from '../../lib/errors';
import { perUser } from '../../lib/rateLimit';
import { adminDid } from '../admin/audit';
import { can } from '../admin/permissions';
import { currentUser, requireUser } from '../auth/requireUser';
import { pushSupportReply } from '../notifications/notify';

// Support (BACKEND_PLAN B15.6): Sahla's support email, and one chat per person
// with the support team. Customers and drivers write from the app; admins with
// the support permission answer from the dashboard. Polled like chats.

export const supportRoutes = Router();

export const SUPPORT_TEXT_MAX = 2000;
const text = z.string().trim().min(1).max(SUPPORT_TEXT_MAX);
const PAGE = 200;

type MessageRow = { id: string; fromSupport: boolean; text: string; orderId: string | null; createdAt: Date; sender?: { name: string } | null };
const toApiMessage = (m: MessageRow, withName = false) => ({
  id: m.id,
  fromSupport: m.fromSupport,
  text: m.text,
  ...(m.orderId && { orderId: m.orderId }),
  // The person sees "Sahla support", never which admin answered.
  ...(withName && m.sender && { senderName: m.sender.name }),
  createdAt: m.createdAt.toISOString(),
});

const latest = (threadId: string, withSender = false) =>
  prisma.supportMessage
    .findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: PAGE,
      ...(withSender && { include: { sender: { select: { name: true } } } }),
    })
    .then(rows => rows.reverse());

// ---- the app (customers and drivers)

/** GET /support: the support email and my conversation (oldest first); opening it marks replies read. */
supportRoutes.get('/support', requireUser, async (_req, res) => {
  const me = currentUser(res.locals);
  const thread = await prisma.supportThread.findUnique({ where: { userId: me.id } });
  const messages = thread ? await latest(thread.id) : [];
  if (thread) await prisma.supportThread.update({ where: { id: thread.id }, data: { userReadAt: new Date() } });
  res.set('Cache-Control', 'no-store').json({ email: env.SUPPORT_EMAIL, messages: messages.map(m => toApiMessage(m)) });
});

const sendLimit = perUser('support', { limit: 30, minutes: 10, message: 'Too many messages: wait a few minutes' });

supportRoutes.post('/support/messages', requireUser, ...sendLimit, async (req, res) => {
  const me = currentUser(res.locals);
  const body = z.object({ text, orderId: z.string().trim().toUpperCase().max(20).optional() }).parse(req.body);
  // An order it's about must be theirs (as buyer, seller or driver).
  if (body.orderId) {
    const order = await prisma.order.findUnique({ where: { id: body.orderId } });
    if (!order || ![order.buyerId, order.sellerUserId, order.courierId].includes(me.id))
      throw new ApiError(422, 'VALIDATION', 'orderId: one of your orders');
  }
  const now = new Date();
  const thread = await prisma.supportThread.upsert({
    where: { userId: me.id },
    create: { userId: me.id, lastMessageAt: now, userReadAt: now },
    update: { open: true, lastMessageAt: now, userReadAt: now },
  });
  const message = await prisma.supportMessage.create({
    data: { threadId: thread.id, senderId: me.id, text: body.text, orderId: body.orderId },
  });
  res.status(201).json(toApiMessage(message));
});

// ---- the dashboard (support permission)

const threadInclude = {
  user: { select: { id: true, name: true, email: true, role: true } },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
};

/** The inbox: open conversations first, newest message first; `waiting` = the person wrote after support last looked. */
supportRoutes.get('/admin/support', ...can('support'), async (req, res) => {
  const { open } = z.object({ open: z.enum(['true', 'false']).optional() }).parse(req.query);
  const threads = await prisma.supportThread.findMany({
    where: open ? { open: open === 'true' } : {},
    include: threadInclude,
    orderBy: [{ open: 'desc' }, { lastMessageAt: 'desc' }],
    take: 100,
  });
  res.json(
    threads.map(t => {
      const last = t.messages[0];
      return {
        userId: t.userId,
        user: { ...t.user, email: t.user.email ?? '' },
        open: t.open,
        lastMessage: last ? toApiMessage(last) : null,
        waiting: !!last && !last.fromSupport && (!t.supportReadAt || t.supportReadAt < last.createdAt),
        lastMessageAt: t.lastMessageAt.toISOString(),
      };
    }),
  );
});

const threadOf = async (userId: string) => {
  const thread = await prisma.supportThread.findUnique({ where: { userId }, include: { user: { select: { id: true, name: true, email: true, role: true } } } });
  if (!thread) throw new ApiError(404, 'NOT_FOUND', 'No support conversation with this person');
  return thread;
};

supportRoutes.get('/admin/support/:userId', ...can('support'), async (req, res) => {
  const thread = await threadOf(req.params.userId as string);
  const messages = await latest(thread.id, true);
  await prisma.supportThread.update({ where: { id: thread.id }, data: { supportReadAt: new Date() } });
  res.json({
    user: { ...thread.user, email: thread.user.email ?? '' },
    open: thread.open,
    messages: messages.map(m => toApiMessage(m, true)),
  });
});

supportRoutes.post('/admin/support/:userId/messages', ...can('support'), async (req, res) => {
  const thread = await threadOf(req.params.userId as string);
  const body = z.object({ text }).parse(req.body);
  const now = new Date();
  const message = await prisma.supportMessage.create({
    data: { threadId: thread.id, senderId: currentUser(res.locals).id, fromSupport: true, text: body.text },
    include: { sender: { select: { name: true } } },
  });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { open: true, lastMessageAt: now, supportReadAt: now } });
  pushSupportReply(thread.userId);
  res.status(201).json(toApiMessage(message, true));
});

/** Done: off the open list until the person writes again. */
supportRoutes.post('/admin/support/:userId/close', ...can('support'), async (req, res) => {
  const thread = await threadOf(req.params.userId as string);
  await prisma.supportThread.update({ where: { id: thread.id }, data: { open: false } });
  await adminDid(req, res, 'support.close', { type: 'user', id: thread.userId }, {});
  res.status(204).end();
});
