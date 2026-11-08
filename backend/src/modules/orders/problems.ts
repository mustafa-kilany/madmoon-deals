import {
  CANCEL_REASONS,
  failReasonsFor,
  ITEM_ISSUE_REASONS,
  needsNote,
  NOTE_MAX,
  type FailStage,
} from '@/lib/deliveryProblems';
import { z } from 'zod';
import { prisma } from '../../db';
import type { Order, Prisma } from '../../generated/prisma/client';
import { reportError } from '../../lib/errorReporter';
import { ApiError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import {
  pushCancelled,
  pushDeliveryFailed,
  pushItemIssue,
  pushProblemResolved,
} from '../notifications/notify';
import { provider } from './pay';
import { orderInclude } from './shapes';

// When an order doesn't simply arrive (BACKEND_PLAN B15.3–B15.4):
// - the buyer cancels before the driver has picked it up: money back at once;
// - the buyer reports a problem with the item at the door instead of giving the PIN;
// - the driver can't finish (at the seller or at the buyer) and says why;
// - an admin decides: try again, or refund (the item goes back to the seller).
// The reason lists live in frontend/src/lib/deliveryProblems.ts (shared with the app).

const note = z.string().trim().max(NOTE_MAX).optional();
const withNote = <T extends string>(reasons: readonly [T, ...T[]]) =>
  z
    .object({ reason: z.enum(reasons), note })
    .refine(v => !needsNote(v.reason) || (v.note?.length ?? 0) >= 3, {
      message: 'note: say what happened (a few words)',
      path: ['note'],
    });

export const cancelInput = withNote(CANCEL_REASONS);
export const itemIssueInput = withNote(ITEM_ISSUE_REASONS);

const notFound = (id: string) => new ApiError(404, 'NOT_FOUND', `No order ${id}`);
const reload = (id: string) => prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });

/**
 * Ends a paid order with the money back: status refunded / cancelled, the
 * payment refunded, the listing on sale again (or withdrawn when the item
 * itself was the problem). `still` re-checks the order under the lock.
 *
 * S3.4: the order's row stays locked while the provider is asked, so a second
 * refund, a cancel or the courier's confirm-delivery at the same moment waits
 * here and then finds the order already closed: the bank is asked once, and an
 * order never ends both refunded and paid out. If the provider refuses, the
 * transaction rolls back and nothing changes.
 */
export async function giveMoneyBack(
  order: Pick<Order, 'id'>,
  status: 'refunded' | 'cancelled',
  data: Partial<Order>,
  { relist = true, still = {} as Prisma.OrderWhereInput } = {},
) {
  let asked: string | undefined;
  try {
    await prisma.$transaction(
      async tx => {
        await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
        const current = await tx.order.findFirst({
          where: { id: order.id, status: 'escrow_held', ...still },
          select: { listingId: true },
        });
        if (!current) throw new ApiError(422, 'VALIDATION', 'This order just changed');
        const payment = await tx.payment.findFirst({ where: { orderId: order.id, status: 'succeeded' } });
        if (!payment) throw new ApiError(422, 'VALIDATION', 'This order has no payment to give back');

        await provider().refund(payment.providerRef, payment.amountFils);
        asked = payment.providerRef;

        await tx.order.update({ where: { id: order.id }, data: { ...data, status, refundedAt: new Date() } });
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'refunded' } });
        await tx.listing.updateMany({
          where: { id: current.listingId, status: 'reserved' },
          data: { status: relist ? 'active' : 'withdrawn' },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    // The money went back but the database couldn't record it: a person must look.
    if (asked) {
      logger.error({ err: error, orderId: order.id, providerRef: asked }, 'Refund sent but not recorded');
      void reportError(error, 'refund not recorded');
    }
    throw error;
  }
}

/** POST /orders/:id/cancel (buyer): until the driver has picked it up. */
export async function cancelOrder(buyerId: string, orderId: string, input: z.infer<typeof cancelInput>) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== buyerId) throw notFound(orderId);
  const reason = { cancelReason: input.reason, cancelNote: input.note || null, cancelledAt: new Date() };
  if (order.status === 'awaiting_payment') {
    // Nothing paid yet: just closed.
    await prisma.order.updateMany({ where: { id: orderId, status: 'awaiting_payment' }, data: { ...reason, status: 'cancelled' } });
    return reload(orderId);
  }
  if (order.status !== 'escrow_held') throw new ApiError(422, 'VALIDATION', `This order is ${order.status}`);
  if (order.courierStatus && order.courierStatus !== 'to_pickup')
    throw new ApiError(422, 'VALIDATION', 'The driver already has the item: report a problem at the door instead');
  await giveMoneyBack(order, 'cancelled', reason, {
    still: { OR: [{ courierStatus: null }, { courierStatus: 'to_pickup' }] },
  });
  pushCancelled(orderId, order.courierId);
  return reload(orderId);
}

/** POST /orders/:id/problem (buyer): at the door, instead of giving the PIN. */
export async function reportItemIssue(buyerId: string, orderId: string, input: z.infer<typeof itemIssueInput>) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== buyerId) throw notFound(orderId);
  if (order.status !== 'escrow_held' || order.courierStatus !== 'picked_up')
    throw new ApiError(422, 'VALIDATION', 'Only when the driver has the item (on the way or at your door)');
  await prisma.order.update({
    where: { id: orderId },
    data: { itemIssueReason: input.reason, itemIssueNote: input.note || null, itemIssueAt: new Date() },
  });
  pushItemIssue(orderId);
  return reload(orderId);
}

/** POST /courier/deliveries/:orderId/failed (driver): at the seller or at the buyer. */
export async function markDeliveryFailed(courierId: string, orderId: string, body: unknown) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.courierId !== courierId) throw new ApiError(404, 'NOT_FOUND', `No delivery ${orderId}`);
  if (order.status !== 'escrow_held' || !['to_pickup', 'picked_up'].includes(order.courierStatus ?? ''))
    throw new ApiError(422, 'VALIDATION', `This delivery is ${order.courierStatus ?? order.status}`);
  const stage: FailStage = order.courierStatus === 'to_pickup' ? 'pickup' : 'dropoff';
  const reasons = failReasonsFor(stage) as [string, ...string[]];
  const input = withNote(reasons).parse(body);
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, courierId, status: 'escrow_held', courierStatus: order.courierStatus },
    data: {
      courierStatus: 'failed',
      failedStage: stage,
      failedReason: input.reason,
      failedNote: input.note || null,
      failedAt: new Date(),
    },
  });
  if (!count) throw new ApiError(422, 'VALIDATION', 'This delivery just changed');
  pushDeliveryFailed(orderId);
  return order;
}

const clearProblem = {
  itemIssueReason: null,
  itemIssueNote: null,
  itemIssueAt: null,
  failedStage: null,
  failedReason: null,
  failedNote: null,
  failedAt: null,
};

export const resolveInput = z.discriminatedUnion('action', [
  // Try again: the same driver, or another one (an active courier account).
  z.object({ action: z.literal('retry'), courierId: z.string().min(1).optional() }),
  // Money back to the buyer; relist = the listing on sale again (false when the item was the problem).
  z.object({ action: z.literal('refund'), relist: z.boolean().default(true) }),
]);

/** Orders waiting for an admin: a failed delivery, or a buyer's report at the door. */
export const problemWhere: Prisma.OrderWhereInput = {
  status: 'escrow_held',
  OR: [{ courierStatus: 'failed' }, { itemIssueAt: { not: null } }],
};

/** POST /admin/orders/:id/resolve-problem. */
export async function resolveProblem(orderId: string, input: z.infer<typeof resolveInput>) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound(orderId);
  if (order.status !== 'escrow_held' || (order.courierStatus !== 'failed' && !order.itemIssueAt))
    throw new ApiError(422, 'VALIDATION', 'This order has no open delivery problem');
  const resolved = { problemResolution: input.action, problemResolvedAt: new Date() };

  if (input.action === 'refund') {
    await giveMoneyBack(order, 'refunded', resolved, { relist: input.relist });
  } else {
    if (input.courierId) {
      const courier = await prisma.user.findUnique({ where: { id: input.courierId } });
      if (!courier || courier.role !== 'courier' || courier.suspended)
        throw new ApiError(422, 'VALIDATION', 'courierId: an active courier account');
    }
    // Back to where it stopped: the item is still at the seller's, or with the driver.
    const atSeller = order.courierStatus === 'failed' ? order.failedStage === 'pickup' : order.courierStatus === 'to_pickup';
    await prisma.order.update({
      where: { id: orderId },
      data: {
        ...clearProblem,
        ...resolved,
        courierStatus: atSeller ? 'to_pickup' : 'picked_up',
        ...(input.courierId && { courierId: input.courierId, assignedAt: new Date() }),
      },
    });
  }
  pushProblemResolved(orderId, input.action);
  return { before: order, after: await reload(orderId) };
}
