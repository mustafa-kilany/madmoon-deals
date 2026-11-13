import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client';
import { coverUrl } from '../catalog/apiItem';

// Order rows → docs/API.md → Phase 6 `Order`.

export const orderInclude = {
  listing: { select: { titleAr: true, titleEn: true, imageUrls: true } },
  // The bank's card check page, while the latest attempt waits for it.
  payments: { where: { status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 1, select: { paymentUrl: true } },
  payout: { select: { status: true, amountFils: true } },
} satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const iso = (d: Date | null) => d?.toISOString();

/** B15.3–B15.4: the driver's progress and why an order didn't arrive (docs/API.md `Order`). */
const problems = (order: OrderRow) => ({
  ...(order.courierStatus && { courierStatus: order.courierStatus }),
  ...(order.cancelReason && {
    cancel: { reason: order.cancelReason, ...(order.cancelNote && { note: order.cancelNote }), at: iso(order.cancelledAt) },
  }),
  ...(order.itemIssueReason && {
    itemIssue: { reason: order.itemIssueReason, ...(order.itemIssueNote && { note: order.itemIssueNote }), at: iso(order.itemIssueAt) },
  }),
  ...(order.failedReason && {
    deliveryFailed: {
      stage: order.failedStage,
      reason: order.failedReason,
      ...(order.failedNote && { note: order.failedNote }),
      at: iso(order.failedAt),
    },
  }),
  ...(order.refundedAt && { refundedAt: iso(order.refundedAt) }),
});

const common = (order: OrderRow, req: Request) => ({
  id: order.id,
  itemId: order.listingId,
  itemTitle: { ar: order.listing.titleAr, en: order.listing.titleEn },
  itemImageUrl: coverUrl(order.listing.imageUrls, req),
  itemPriceFils: order.itemPriceFils,
  buyerProtectionFils: order.buyerProtectionFils,
  deliveryFils: order.deliveryFils,
  totalFils: order.totalFils,
  status: order.status,
  ...(order.offerId && { offerId: order.offerId }),
  createdAt: order.createdAt.toISOString(),
  ...(order.deliveredAt && { deliveredAt: order.deliveredAt.toISOString() }),
  ...problems(order),
});

/** The buyer's view: everything, with the PIN once paid. */
export const toApiOrder = (order: OrderRow, req: Request) => {
  const paymentUrl = order.status === 'awaiting_payment' ? order.payments[0]?.paymentUrl : undefined;
  return {
    ...common(order, req),
    ...(order.status === 'escrow_held' && order.pin && { pin: order.pin }),
    delivery: {
      name: order.deliveryName,
      phone: order.deliveryPhone,
      cityId: order.deliveryCityId,
      address: order.deliveryAddress,
      ...(order.deliveryNotes && { notes: order.deliveryNotes }),
    },
    ...(paymentUrl && { paymentUrl }),
  };
};

/** The seller's pickup address (B14.5), once given. */
export const pickupOf = (order: OrderRow) =>
  order.pickupName && order.pickupPhone && order.pickupCityId && order.pickupAddress
    ? {
        name: order.pickupName,
        phone: order.pickupPhone,
        cityId: order.pickupCityId,
        address: order.pickupAddress,
        ...(order.pickupNotes && { notes: order.pickupNotes }),
      }
    : undefined;

/**
 * The seller's view (GET /me/sales): no PIN, and of the delivery details only the
 * buyer's name and area. The phone and address are for the courier only.
 */
export const toApiSale = (order: OrderRow, req: Request) => {
  const pickup = pickupOf(order);
  return {
    ...common(order, req),
    delivery: { name: order.deliveryName, cityId: order.deliveryCityId },
    ...(pickup && { pickup }),
    // B15.9: the seller's money once delivered.
    ...(order.payout && { payout: order.payout }),
  };
};
