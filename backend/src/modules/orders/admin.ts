import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { adminDid } from '../admin/audit';
import { currentUser, requireAdmin } from '../auth/requireUser';
import { pushAssigned } from '../notifications/notify';
import { provider } from './pay';
import { resolveInput, resolveProblem } from './problems';
import { orderInclude, toApiOrder } from './shapes';
import { allowed, can } from '../admin/permissions';

// Support's order tools (BACKEND_PLAN B7.7), for the admin dashboard (B8.5).
// No app endpoint: the buyer asks support when an item never arrives.

export const adminOrderRoutes = Router();

const findOrder = async (id: string) => {
  const order = await prisma.order.findUnique({ where: { id }, include: { payments: { where: { status: 'succeeded' } } } });
  if (!order) throw new ApiError(404, 'NOT_FOUND', `No order ${id}`);
  return order;
};

/**
 * Money back to the buyer and the listing on sale again. Only while the money
 * is held: after delivery it has gone to the seller.
 */
export async function refundOrder(orderId: string) {
  const order = await findOrder(orderId);
  if (order.status !== 'escrow_held') throw new ApiError(422, 'VALIDATION', `Only paid, undelivered orders (this one is ${order.status})`);
  const [payment] = order.payments;
  // The provider first: if it refuses, nothing changes here and support can try again.
  await provider().refund(payment.providerRef, payment.amountFils);
  await prisma.$transaction(async tx => {
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: 'escrow_held' }, data: { status: 'refunded', refundedAt: new Date() } });
    if (!count) throw new ApiError(422, 'VALIDATION', 'This order just changed');
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'refunded' } });
    await tx.listing.updateMany({ where: { id: order.listingId, status: 'reserved' }, data: { status: 'active' } });
  });
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

adminOrderRoutes.post('/admin/orders/:id/refund', ...can('refund'), async (req, res) => {
  const order = await refundOrder(req.params.id as string);
  await adminDid(req, res, 'order.refund', { type: 'order', id: order.id }, { totalFils: order.totalFils });
  res.json(toApiOrder(order, req));
});

/** After 5 wrong delivery PINs (the buyer confirmed it's really the courier at the door). */
adminOrderRoutes.post('/admin/orders/:id/unlock-pin', ...can('dispatch'), async (req, res) => {
  const order = await findOrder(req.params.id as string);
  if (order.status !== 'escrow_held') throw new ApiError(422, 'VALIDATION', `This order is ${order.status}`);
  await prisma.order.update({ where: { id: order.id }, data: { pinAttempts: 0 } });
  await adminDid(req, res, 'order.unlock_pin', { type: 'order', id: order.id }, { pinAttempts: order.pinAttempts });
  res.json(toApiOrder(await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude }), req));
});

/**
 * B14.6: give a paid order to a courier (later: by area, automatically). Can be
 * changed until it's picked up.
 */
adminOrderRoutes.post('/admin/orders/:id/assign', ...can('dispatch'), async (req, res) => {
  const { courierId } = z.object({ courierId: z.string().min(1) }).parse(req.body);
  const order = await findOrder(req.params.id as string);
  if (order.status !== 'escrow_held' || (order.courierStatus && order.courierStatus !== 'to_pickup'))
    throw new ApiError(422, 'VALIDATION', 'Only paid orders that aren’t picked up yet');
  const courier = await prisma.user.findUnique({ where: { id: courierId } });
  if (!courier || courier.role !== 'courier' || courier.suspended)
    throw new ApiError(422, 'VALIDATION', 'courierId: an active courier account');
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { courierId, courierStatus: 'to_pickup', assignedAt: new Date() },
    include: orderInclude,
  });
  pushAssigned(order.id);
  await adminDid(req, res, 'order.assign', { type: 'order', id: order.id }, { before: order.courierId, after: courierId });
  res.json(toApiOrder(updated, req));
});

/**
 * B15.4: a failed delivery or the buyer's report at the door. Retry (same or another
 * driver, from where it stopped) or refund (relist: false when the item was the problem).
 */
adminOrderRoutes.post('/admin/orders/:id/resolve-problem', ...requireAdmin, async (req, res) => {
  const input = resolveInput.parse(req.body);
  // B15.7: retrying is dispatching; a refund needs the refund permission.
  if (!allowed(currentUser(res.locals).adminRole, input.action === 'refund' ? 'refund' : 'dispatch'))
    throw new ApiError(403, 'FORBIDDEN', `Your admin type can’t do this (${input.action})`);
  const { before, after } = await resolveProblem((req.params.id as string).toUpperCase(), input);
  await adminDid(req, res, `order.problem_${input.action}`, { type: 'order', id: after.id }, {
    failed: before.failedReason && { stage: before.failedStage, reason: before.failedReason, note: before.failedNote },
    itemIssue: before.itemIssueReason && { reason: before.itemIssueReason, note: before.itemIssueNote },
    ...input,
  });
  res.json(toApiOrder(after, req));
});
