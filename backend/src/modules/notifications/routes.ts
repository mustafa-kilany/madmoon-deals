import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { currentUser, requireUser } from '../auth/requireUser';

// docs/API.md → Live Updates & Notifications (BACKEND_PLAN B9.2). The app sends
// its push token after signing in and whenever it changes, and removes it on
// log-out. Sending the pushes (B9.3) needs the Firebase project.

export const notificationRoutes = Router();

notificationRoutes.post('/me/devices', requireUser, async (req, res) => {
  const { token, platform } = z
    .object({ token: z.string().trim().min(20).max(4096), platform: z.enum(['android', 'ios']) })
    .parse(req.body);
  const userId = currentUser(res.locals).id;
  // Another account signed in on this phone before: the phone is now this account's.
  await prisma.device.upsert({ where: { token }, create: { token, userId, platform }, update: { userId, platform } });
  res.status(204).end();
});

// 204 even if it isn't there (already removed, or another account's now).
notificationRoutes.delete('/me/devices/:token', requireUser, async (req, res) => {
  await prisma.device.deleteMany({ where: { token: req.params.token as string, userId: currentUser(res.locals).id } });
  res.status(204).end();
});
