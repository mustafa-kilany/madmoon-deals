import { Router } from 'express';
import { prisma } from '../../db';
import { requireAdmin } from '../auth/requireUser';

// The dashboard's overview page (BACKEND_PLAN B8.2): business numbers only.
// Technical health (errors, slow requests) belongs in Sentry and the host's
// metrics (B12), not here.

export const statsRoutes = Router();

const DAY = 86_400_000;

statsRoutes.get('/admin/stats', ...requireAdmin, async (_req, res) => {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const monthAgo = new Date(now - 30 * DAY);
  const [
    users,
    newUsers,
    activeListings,
    newListings,
    awaitingPayment,
    held,
    toAssign,
    completed,
    pendingPayouts,
    hiddenByReports,
    openFlags,
    certificates,
    couriers,
  ] = await Promise.all([
    prisma.user.count({ where: { role: null } }),
    prisma.user.count({ where: { role: null, createdAt: { gte: weekAgo } } }),
    prisma.listing.count({
      where: { status: 'active', reportHidden: false, OR: [{ sellerUserId: null }, { sellerUser: { suspended: false } }] },
    }),
    prisma.listing.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.order.count({ where: { status: 'awaiting_payment' } }),
    prisma.order.aggregate({ where: { status: 'escrow_held' }, _count: true, _sum: { totalFils: true } }),
    prisma.order.count({ where: { status: 'escrow_held', courierId: null } }),
    prisma.order.aggregate({
      where: { status: 'completed', deliveredAt: { gte: monthAgo } },
      _count: true,
      _sum: { totalFils: true },
    }),
    prisma.payout.aggregate({ where: { status: 'pending' }, _count: true, _sum: { amountFils: true } }),
    prisma.listing.count({ where: { reportHidden: true, status: { not: 'withdrawn' } } }),
    prisma.riskFlag.count({ where: { status: 'open' } }),
    // Passed on the text alone (no stamp detector yet) and on sale: an admin should look.
    prisma.testCertificate.count({
      where: { status: 'passed', stampChecked: false, listing: { status: { in: ['active', 'reserved'] } } },
    }),
    prisma.user.count({ where: { role: 'courier', suspended: false } }),
  ]);
  res.json({
    users: { total: users, newThisWeek: newUsers },
    listings: { active: activeListings, newThisWeek: newListings },
    orders: {
      awaitingPayment,
      escrowHeld: { count: held._count, totalFils: held._sum.totalFils ?? 0 },
      toAssign,
      completedLast30Days: { count: completed._count, totalFils: completed._sum.totalFils ?? 0 },
    },
    payouts: { pending: { count: pendingPayouts._count, amountFils: pendingPayouts._sum.amountFils ?? 0 } },
    queues: { hiddenByReports, riskFlags: openFlags, certificates },
    couriers: { active: couriers },
  });
});
