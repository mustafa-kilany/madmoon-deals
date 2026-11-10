import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { currentUser, requireUser } from '../auth/requireUser';
import { announceAfterSaving } from '../negotiation/live';

// docs/API.md → Live Updates & Notifications (BACKEND_PLAN B9.2). The app sends
// its push token after signing in and whenever it or the language changes, and
// removes it on log-out. The pushes themselves: notify.ts (B9.3). The inbox keeps a copy of each (M2).

export const notificationRoutes = Router();

notificationRoutes.post('/me/devices', requireUser, async (req, res) => {
  const { token, platform, language } = z
    .object({
      token: z.string().trim().min(20).max(4096),
      platform: z.enum(['android', 'ios']),
      language: z.enum(['ar', 'en']).default('en'),
    })
    .parse(req.body);
  const userId = currentUser(res.locals).id;
  // Tied to this sign-in: when it ends (log-out, password reset, expiry), so do the pushes.
  const data = { userId, platform, language, sessionId: res.locals.sessionId };
  // Another account signed in on this phone before: the phone is now this account's.
  await prisma.device.upsert({ where: { token }, create: { token, ...data }, update: data });
  res.status(204).end();
});

// 204 even if it isn't there (already removed, or another account's now).
notificationRoutes.delete('/me/devices/:token', requireUser, async (req, res) => {
  await prisma.device.deleteMany({ where: { token: req.params.token as string, userId: currentUser(res.locals).id } });
  res.status(204).end();
});

// M2: the inbox. Newest first, in the asked language, with how many are unread (the app's dot).
notificationRoutes.get('/me/notifications', requireUser, async (req, res) => {
  const { lang } = z.object({ lang: z.enum(['ar', 'en']).default('ar') }).parse(req.query);
  const userId = currentUser(res.locals).id;
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({
    unreadCount,
    items: rows.map(n => ({
      id: n.id,
      type: n.type,
      refId: n.refId,
      title: lang === 'ar' ? n.titleAr : n.titleEn,
      body: lang === 'ar' ? n.bodyAr : n.bodyEn,
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

// Opening the inbox reads everything in it. The person's other phones hear, so their dot goes too.
notificationRoutes.post('/me/notifications/read', requireUser, async (_req, res) => {
  const userId = currentUser(res.locals).id;
  const { count } = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  if (count) await announceAfterSaving([userId], { type: 'notifications' });
  res.status(204).end();
});
