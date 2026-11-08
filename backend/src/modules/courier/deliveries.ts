import type { Request } from 'express';
import { prisma } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { coverUrl } from '../catalog/apiItem';
import { pushPickedUp } from '../notifications/notify';

// The courier app's list (BACKEND_PLAN B14.3, B14.4), docs/API.md → Couriers.
// Pickup and drop-off are shown only to the courier the order is assigned to.

const deliveryInclude = {
  listing: { select: { titleAr: true, titleEn: true, imageUrls: true, locationId: true } },
  sellerUser: { select: { name: true } },
  store: { select: { nameEn: true } },
} satisfies Prisma.OrderInclude;
type DeliveryRow = Prisma.OrderGetPayload<{ include: typeof deliveryInclude }>;

/** Jordan is UTC+3 all year (since 2022), so "today" starts at 21:00 UTC. */
const startOfJordanDay = (now = new Date()) => {
  const jordan = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(jordan.getUTCFullYear(), jordan.getUTCMonth(), jordan.getUTCDate()) - 3 * 3_600_000);
};

/** GET /courier/deliveries: mine that aren't delivered, and today's delivered ones; oldest assignment first. */
export const listDeliveries = (courierId: string) =>
  prisma.order.findMany({
    where: {
      courierId,
      OR: [
        { courierStatus: { in: ['to_pickup', 'picked_up'] }, status: 'escrow_held' },
        { courierStatus: 'delivered', deliveredAt: { gte: startOfJordanDay() } },
        // B15.4: today's failed ones stay on the list (with the reason) until an admin decides.
        { courierStatus: 'failed', failedAt: { gte: startOfJordanDay() } },
      ],
    },
    include: deliveryInclude,
    orderBy: { assignedAt: 'asc' },
  });

export const deliveryById = (orderId: string) => prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: deliveryInclude });

/** POST /courier/deliveries/:orderId/picked-up. */
export async function markPickedUp(courierId: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.courierId !== courierId) throw new ApiError(404, 'NOT_FOUND', `No delivery ${orderId}`);
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, courierId, courierStatus: 'to_pickup', status: 'escrow_held' },
    data: { courierStatus: 'picked_up', pickedUpAt: new Date() },
  });
  if (!count) throw new ApiError(422, 'VALIDATION', `This delivery is ${order.courierStatus}, not waiting for pickup`);
  pushPickedUp(orderId);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: deliveryInclude });
}

/**
 * docs/API.md `Delivery`: pickup and drop-off both come from the order (the
 * pickup was copied from the listing or the store when the order was placed,
 * B14.5). Older orders without one show the seller's name and the listing's area.
 *
 * S2.3: phones and addresses are for the job. Once it is delivered or failed the driver
 * keeps only names and areas (an admin's retry brings the rest back).
 */
export const toApiDelivery = (order: DeliveryRow, req: Request) => {
  const working = order.courierStatus !== 'delivered' && order.courierStatus !== 'failed';
  return {
  orderId: order.id,
  status: order.courierStatus ?? 'to_pickup',
  itemTitle: { ar: order.listing.titleAr, en: order.listing.titleEn },
  itemImageUrl: coverUrl(order.listing.imageUrls, req),
  pickup: order.pickupName
    ? {
        name: order.pickupName,
        phone: working ? (order.pickupPhone ?? '') : '',
        cityId: order.pickupCityId ?? order.listing.locationId,
        address: working ? (order.pickupAddress ?? '') : '',
        ...(working && order.pickupNotes && { notes: order.pickupNotes }),
      }
    : { name: order.sellerUser?.name ?? order.store?.nameEn ?? '', phone: '', cityId: order.listing.locationId, address: '' },
  dropoff: {
    name: order.deliveryName,
    phone: working ? order.deliveryPhone : '',
    cityId: order.deliveryCityId,
    address: working ? order.deliveryAddress : '',
    ...(working && order.deliveryNotes && { notes: order.deliveryNotes }),
  },
  assignedAt: (order.assignedAt ?? order.paidAt ?? order.createdAt).toISOString(),
  ...(order.pickedUpAt && { pickedUpAt: order.pickedUpAt.toISOString() }),
  ...(order.deliveredAt && { deliveredAt: order.deliveredAt.toISOString() }),
  // B15.4: the buyer's report at the door, and why this driver couldn't finish.
  ...(order.itemIssueReason && {
    buyerIssue: { reason: order.itemIssueReason, ...(order.itemIssueNote && { note: order.itemIssueNote }), at: order.itemIssueAt!.toISOString() },
  }),
  ...(order.failedReason && {
    failed: { stage: order.failedStage, reason: order.failedReason, ...(order.failedNote && { note: order.failedNote }), at: order.failedAt!.toISOString() },
  }),
  };
};
