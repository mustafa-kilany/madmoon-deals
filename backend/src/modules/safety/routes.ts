import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { currentUser, requireCustomer } from '../auth/requireUser';

// docs/API.md → Safety: report and block (BACKEND_PLAN B5.1, B5.2). Required by
// the App Store for apps with listings and chat.

export const safetyRoutes = Router();

/** This many different people reporting one listing hide it until an admin looks (B8). */
export const HIDE_AFTER_REPORTS = 3;

const report = z.object({
  targetType: z.enum(['listing', 'user']),
  targetId: z.string().min(1),
  reason: z.enum(['scam', 'prohibited', 'offensive', 'wrong_info', 'other']),
  details: z.string().trim().max(500).optional(),
});

safetyRoutes.post('/reports', ...requireCustomer, async (req, res) => {
  const input = report.parse(req.body);
  const reporterId = currentUser(res.locals).id;
  const exists =
    input.targetType === 'listing'
      ? await prisma.listing.count({ where: { id: input.targetId, status: { not: 'withdrawn' } } })
      : await prisma.user.count({ where: { id: input.targetId } });
  if (!exists) throw new ApiError(404, 'NOT_FOUND', `No ${input.targetType} ${input.targetId}`);

  await prisma.report.create({ data: { ...input, details: input.details || undefined, reporterId } });
  if (input.targetType === 'listing') {
    const reporters = await prisma.report.groupBy({
      by: ['reporterId'],
      where: { targetType: 'listing', targetId: input.targetId },
    });
    if (reporters.length >= HIDE_AFTER_REPORTS)
      await prisma.listing.update({ where: { id: input.targetId }, data: { reportHidden: true } });
  }
  res.status(204).end();
});

safetyRoutes.post('/me/blocked', ...requireCustomer, async (req, res) => {
  const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
  const blockerId = currentUser(res.locals).id;
  if (userId === blockerId) throw new ApiError(422, 'VALIDATION', 'You cannot block yourself');
  if (!(await prisma.user.count({ where: { id: userId } }))) throw new ApiError(404, 'NOT_FOUND', `No user ${userId}`);
  await prisma.block.createMany({ data: [{ blockerId, blockedId: userId }], skipDuplicates: true });
  res.status(204).end();
});

safetyRoutes.get('/me/blocked', ...requireCustomer, async (_req, res) => {
  const blocks = await prisma.block.findMany({
    where: { blockerId: currentUser(res.locals).id },
    include: { blocked: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(blocks.map(b => b.blocked));
});

safetyRoutes.delete('/me/blocked/:userId', ...requireCustomer, async (req, res) => {
  await prisma.block.deleteMany({ where: { blockerId: currentUser(res.locals).id, blockedId: req.params.userId as string } });
  res.status(204).end();
});
