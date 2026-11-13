import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { currentUser } from '../auth/requireUser';
import { adminDid } from './audit';
import { can } from './permissions';

// Users in the dashboard (BACKEND_PLAN B8.5): look up, suspend, unsuspend.
// Suspending signs the person out everywhere, takes their listings off sale
// (safety/blocks.ts → visibleListings) and stops their pushes; their paid
// orders carry on (an admin can refund them). Staff accounts are managed with
// `npm run staff` and the courier page, not here.

export const adminUsersRoutes = Router();

const iso = (d: Date | null) => d?.toISOString() ?? null;

const toAdminUserSummary = (u: Prisma.UserGetPayload<object>) => ({
  id: u.id,
  name: u.name,
  email: u.email ?? '',
  method: u.method,
  role: u.role,
  verified: u.verified,
  suspended: u.suspended,
  cityId: u.cityId,
  createdAt: u.createdAt.toISOString(),
});

const listQuery = z.object({
  /** Part of the email or name, or a user id. */
  q: z.string().trim().max(100).optional(),
  suspended: z.enum(['true', 'false']).optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Newest first; `before` = the last row's createdAt for the next page. */
adminUsersRoutes.get('/admin/users', ...can('orders'), async (req, res) => {
  const q = listQuery.parse(req.query);
  const contains = (text: string) => ({ contains: text, mode: 'insensitive' as const });
  const rows = await prisma.user.findMany({
    where: {
      ...(q.q && { OR: [{ email: contains(q.q) }, { name: contains(q.q) }, { id: q.q }] }),
      ...(q.suspended && { suspended: q.suspended === 'true' }),
      ...(q.before && { createdAt: { lt: new Date(q.before) } }),
    },
    orderBy: { createdAt: 'desc' },
    take: q.limit,
  });
  res.json(rows.map(toAdminUserSummary));
});

adminUsersRoutes.get('/admin/users/:id', ...can('orders'), async (req, res) => {
  const id = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', `No user ${id}`);
  const listingIds = (await prisma.listing.findMany({ where: { sellerUserId: id }, select: { id: true } })).map(l => l.id);
  const [listings, orders, sales, reportsAboutUser, reportsAboutListings, blockedBy, flags, recentOrders, recentSales] =
    await Promise.all([
      prisma.listing.groupBy({ by: ['status'], where: { sellerUserId: id }, _count: true }),
      prisma.order.count({ where: { buyerId: id, status: { not: 'awaiting_payment' } } }),
      prisma.order.count({ where: { sellerUserId: id, status: { not: 'awaiting_payment' } } }),
      prisma.report.count({ where: { targetType: 'user', targetId: id } }),
      listingIds.length ? prisma.report.count({ where: { targetType: 'listing', targetId: { in: listingIds } } }) : 0,
      prisma.block.count({ where: { blockedId: id } }),
      prisma.riskFlag.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.order.findMany({ where: { buyerId: id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, status: true, totalFils: true, createdAt: true } }),
      prisma.order.findMany({ where: { sellerUserId: id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, status: true, totalFils: true, createdAt: true } }),
    ]);
  const brief = (o: { id: string; status: string; totalFils: number; createdAt: Date }) => ({ ...o, createdAt: o.createdAt.toISOString() });
  res.json({
    ...toAdminUserSummary(user),
    listings: Object.fromEntries(listings.map(l => [l.status, l._count])),
    counts: { orders, sales, reportsAboutUser, reportsAboutListings, blockedBy },
    riskFlags: flags.map(f => ({ id: f.id, score: f.score, status: f.status, aiSummary: f.aiSummary, createdAt: f.createdAt.toISOString(), reviewedAt: iso(f.reviewedAt) })),
    recentOrders: recentOrders.map(brief),
    recentSales: recentSales.map(brief),
  });
});

async function customer(id: string, adminId: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', `No user ${id}`);
  if (user.id === adminId) throw new ApiError(422, 'VALIDATION', 'You can’t suspend yourself');
  if (user.role) throw new ApiError(422, 'VALIDATION', 'Staff accounts are managed with npm run staff or the courier page');
  return user;
}

adminUsersRoutes.post('/admin/users/:id/suspend', ...can('suspend'), async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  const user = await customer(req.params.id as string, currentUser(res.locals).id);
  if (user.suspended) throw new ApiError(422, 'VALIDATION', 'Already suspended');
  // Signed out on every phone at once; their phones' push tokens go with the sessions.
  // The review queues (B8.3) close what this decides: reports about them, open risk flags.
  const adminId = currentUser(res.locals).id;
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { suspended: true } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.report.updateMany({
      where: { targetType: 'user', targetId: user.id, resolvedAt: null },
      data: { resolvedAt: now, resolvedById: adminId, resolution: 'suspended' },
    }),
    prisma.riskFlag.updateMany({
      where: { userId: user.id, status: 'open' },
      data: { status: 'actioned', reviewNote: `Suspended: ${reason}`, reviewedById: adminId, reviewedAt: now },
    }),
  ]);
  await adminDid(req, res, 'user.suspend', { type: 'user', id: user.id }, { reason });
  res.json(toAdminUserSummary(updated));
});

adminUsersRoutes.post('/admin/users/:id/unsuspend', ...can('suspend'), async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  const user = await customer(req.params.id as string, currentUser(res.locals).id);
  if (!user.suspended) throw new ApiError(422, 'VALIDATION', 'Not suspended');
  const updated = await prisma.user.update({ where: { id: user.id }, data: { suspended: false } });
  await adminDid(req, res, 'user.unsuspend', { type: 'user', id: user.id }, { reason });
  res.json(toAdminUserSummary(updated));
});
