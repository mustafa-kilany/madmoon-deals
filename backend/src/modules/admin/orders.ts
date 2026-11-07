import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../auth/requireUser';
import { coverUrl } from '../catalog/apiItem';
import { PIN_TRIES } from '../courier/delivery';
import { problemWhere } from '../orders/problems';
import { adminDid } from './audit';

// Orders and payouts in the dashboard (BACKEND_PLAN B8.5). Support sees the
// whole order (delivery and pickup details too) but never the delivery PIN.
// Refund, unlock PIN and assign are in ../orders/admin.ts.

export const adminOrdersRoutes = Router();

const person = { select: { id: true, name: true, email: true } } as const;
const adminOrderInclude = {
  listing: { select: { id: true, titleEn: true, titleAr: true, imageUrls: true } },
  buyer: person,
  sellerUser: person,
  store: { select: { id: true, nameEn: true } },
  courier: { select: { id: true, name: true } },
  payments: { orderBy: { createdAt: 'asc' }, select: { id: true, provider: true, status: true, amountFils: true, createdAt: true } },
  payout: true,
} satisfies Prisma.OrderInclude;
type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof adminOrderInclude }>;

const who = (u: { id: string; name: string; email: string | null } | null) => (u ? { id: u.id, name: u.name, email: u.email ?? '' } : null);
const iso = (d: Date | null) => d?.toISOString() ?? null;

const toAdminOrderSummary = (o: AdminOrderRow, req: Request) => ({
  id: o.id,
  status: o.status,
  courierStatus: o.courierStatus,
  item: { id: o.listing.id, title: o.listing.titleEn, imageUrl: coverUrl(o.listing.imageUrls, req) },
  totalFils: o.totalFils,
  buyer: who(o.buyer),
  seller: o.store ? { id: o.store.id, name: o.store.nameEn, email: '' } : who(o.sellerUser),
  courier: o.courier,
  // B15.4: a failed delivery or the buyer's report at the door, waiting for an admin.
  problem: o.status === 'escrow_held' && (o.courierStatus === 'failed' || !!o.itemIssueAt),
  createdAt: o.createdAt.toISOString(),
});

const toAdminOrder = (o: AdminOrderRow, req: Request) => ({
  ...toAdminOrderSummary(o, req),
  itemPriceFils: o.itemPriceFils,
  buyerProtectionFils: o.buyerProtectionFils,
  deliveryFils: o.deliveryFils,
  offerId: o.offerId,
  pinAttempts: o.pinAttempts,
  pinLocked: o.status === 'escrow_held' && o.pinAttempts >= PIN_TRIES,
  delivery: { name: o.deliveryName, phone: o.deliveryPhone, cityId: o.deliveryCityId, address: o.deliveryAddress, notes: o.deliveryNotes },
  pickup: o.pickupAddress
    ? { name: o.pickupName, phone: o.pickupPhone, cityId: o.pickupCityId, address: o.pickupAddress, notes: o.pickupNotes }
    : null,
  paidAt: iso(o.paidAt),
  assignedAt: iso(o.assignedAt),
  pickedUpAt: iso(o.pickedUpAt),
  deliveredAt: iso(o.deliveredAt),
  refundedAt: iso(o.refundedAt),
  cancel: o.cancelReason ? { reason: o.cancelReason, note: o.cancelNote, at: iso(o.cancelledAt) } : null,
  itemIssue: o.itemIssueReason ? { reason: o.itemIssueReason, note: o.itemIssueNote, at: iso(o.itemIssueAt) } : null,
  deliveryFailed: o.failedReason
    ? { stage: o.failedStage, reason: o.failedReason, note: o.failedNote, at: iso(o.failedAt) }
    : null,
  problemResolution: o.problemResolution ? { action: o.problemResolution, at: iso(o.problemResolvedAt) } : null,
  payments: o.payments.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
  payout: o.payout && { id: o.payout.id, status: o.payout.status, amountFils: o.payout.amountFils, paidAt: iso(o.payout.paidAt) },
});

const listQuery = z.object({
  status: z.enum(['awaiting_payment', 'escrow_held', 'completed', 'refunded', 'cancelled']).optional(),
  /** B15.4: orders with an open delivery problem. */
  problems: z.enum(['true', 'false']).optional(),
  /** Paid orders still waiting for a courier. */
  unassigned: z.enum(['true', 'false']).optional(),
  /** An order id (SA-123456), or part of the buyer's / seller's email or name. */
  q: z.string().trim().max(100).optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });
const matchingPerson = (q: string) => ({ OR: [{ email: contains(q) }, { name: contains(q) }] });

/** Newest first; `before` = the last row's createdAt for the next page. */
adminOrdersRoutes.get('/admin/orders', ...requireAdmin, async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Prisma.OrderWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.unassigned === 'true' && { status: 'escrow_held', courierId: null }),
    ...(q.problems === 'true' && problemWhere),
    ...(q.before && { createdAt: { lt: new Date(q.before) } }),
    ...(q.q &&
      (/^sa-\d+$/i.test(q.q)
        ? { id: q.q.toUpperCase() }
        : { OR: [{ buyer: matchingPerson(q.q) }, { sellerUser: matchingPerson(q.q) }, { id: contains(q.q) }] })),
  };
  const rows = await prisma.order.findMany({ where, include: adminOrderInclude, orderBy: { createdAt: 'desc' }, take: q.limit });
  res.json(rows.map(o => toAdminOrderSummary(o, req)));
});

adminOrdersRoutes.get('/admin/orders/:id', ...requireAdmin, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: (req.params.id as string).toUpperCase() },
    include: adminOrderInclude,
  });
  if (!order) throw new ApiError(404, 'NOT_FOUND', `No order ${req.params.id}`);
  res.json(toAdminOrder(order, req));
});

// Payouts: the seller's money after delivery. Until the payment provider pays
// sellers itself (D2), an admin sends a bank transfer and marks it paid here.

const payoutQuery = z.object({
  status: z.enum(['pending', 'paid', 'failed']).default('pending'),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const payoutInclude = {
  order: { select: { id: true, listing: { select: { titleEn: true } } } },
  sellerUser: person,
  store: { select: { id: true, nameEn: true } },
} satisfies Prisma.PayoutInclude;

const toAdminPayout = (p: Prisma.PayoutGetPayload<{ include: typeof payoutInclude }>) => ({
  id: p.id,
  orderId: p.order.id,
  itemTitle: p.order.listing.titleEn,
  seller: p.store ? { id: p.store.id, name: p.store.nameEn, email: '' } : who(p.sellerUser),
  amountFils: p.amountFils,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
  paidAt: iso(p.paidAt),
});

/** Oldest first for pending (pay in order), newest first otherwise. */
adminOrdersRoutes.get('/admin/payouts', ...requireAdmin, async (req, res) => {
  const q = payoutQuery.parse(req.query);
  const oldestFirst = q.status === 'pending';
  const rows = await prisma.payout.findMany({
    where: { status: q.status, ...(q.before && { createdAt: oldestFirst ? { gt: new Date(q.before) } : { lt: new Date(q.before) } }) },
    include: payoutInclude,
    orderBy: { createdAt: oldestFirst ? 'asc' : 'desc' },
    take: q.limit,
  });
  res.json(rows.map(toAdminPayout));
});

/** The bank transfer was sent. `reference` = the bank's transfer number, kept in the audit log. */
adminOrdersRoutes.post('/admin/payouts/:id/paid', ...requireAdmin, async (req, res) => {
  const { reference } = z.object({ reference: z.string().trim().min(1).max(100) }).parse(req.body);
  const id = req.params.id as string;
  const { count } = await prisma.payout.updateMany({ where: { id, status: { not: 'paid' } }, data: { status: 'paid', paidAt: new Date() } });
  const payout = await prisma.payout.findUnique({ where: { id }, include: payoutInclude });
  if (!payout) throw new ApiError(404, 'NOT_FOUND', `No payout ${id}`);
  if (!count) throw new ApiError(422, 'VALIDATION', 'This payout is already marked paid');
  await adminDid(req, res, 'payout.paid', { type: 'order', id: payout.order.id }, { payoutId: id, amountFils: payout.amountFils, reference });
  res.json(toAdminPayout(payout));
});
