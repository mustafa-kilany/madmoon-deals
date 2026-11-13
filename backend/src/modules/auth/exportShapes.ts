import type { Listing, Order } from '../../generated/prisma/client';

export const LIMIT_PER_KIND = 2000;

export const listingCopy = (l: Listing) => ({
  id: l.id,
  title: { ar: l.titleAr, en: l.titleEn },
  description: l.description,
  priceFils: l.priceFils,
  condition: l.condition,
  status: l.status,
  saleType: l.saleType,
  locationId: l.locationId,
  pickup: { phone: l.pickupPhone, address: l.pickupAddress, notes: l.pickupNotes },
  createdAt: l.createdAt,
});

/** A buyer gets their delivery details and a seller their pickup details; never the other side's, nor the PIN. */
export const orderCopy = (o: Order, side: 'buyer' | 'seller') => ({
  id: o.id,
  listingId: o.listingId,
  status: o.status,
  itemPriceFils: o.itemPriceFils,
  ...(side === 'buyer' && {
    buyerProtectionFils: o.buyerProtectionFils,
    deliveryFils: o.deliveryFils,
    totalFils: o.totalFils,
    delivery: { name: o.deliveryName, phone: o.deliveryPhone, cityId: o.deliveryCityId, address: o.deliveryAddress, notes: o.deliveryNotes },
  }),
  ...(side === 'seller' && { pickup: { name: o.pickupName, phone: o.pickupPhone, cityId: o.pickupCityId, address: o.pickupAddress, notes: o.pickupNotes } }),
  createdAt: o.createdAt,
  paidAt: o.paidAt,
  deliveredAt: o.deliveredAt,
  refundedAt: o.refundedAt,
});
