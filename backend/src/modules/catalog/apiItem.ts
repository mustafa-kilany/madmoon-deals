import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client';
import { publicUrl } from '../../lib/publicUrl';
import { cityById } from '../../reference';

// A listing row → docs/API.md `Item`.

/** What every listing query loads, so toApiItem has the seller, store and certificate. */
export const itemInclude = {
  sellerUser: { select: { name: true } },
  store: { select: { nameEn: true, nameAr: true } },
  testCertificate: {
    select: { blurredUrl: true, shopName: true, testedAt: true, specs: true },
  },
} satisfies Prisma.ListingInclude;

export type ListingRow = Prisma.ListingGetPayload<{ include: typeof itemInclude }>;

/** Stored URLs starting with "/" are files on this server (uploads, seed data, category tiles). */
const absolute = (req: Request, url: string) => (url.startsWith('/') ? publicUrl(req, url) : url);

/** The cover as cards show it: the 400 px square the upload made next to each listing photo (B3). */
export function coverUrl(imageUrls: string[], req: Request) {
  const cover = imageUrls[0] ?? '';
  const thumb = /^\/files\/listings\/[^/]+\.jpg$/.test(cover) ? cover.replace(/\.jpg$/, '_400.jpg') : cover;
  return thumb ? absolute(req, thumb) : '';
}

export function toApiItem(listing: ListingRow, req: Request) {
  const place = cityById.get(listing.locationId);
  const images = listing.imageUrls.map(url => absolute(req, url));
  const cert = listing.testCertificate;
  return {
    id: listing.id,
    category: listing.category,
    title: { ar: listing.titleAr, en: listing.titleEn },
    priceFils: listing.priceFils,
    imageUrl: coverUrl(listing.imageUrls, req),
    // Every photo at full size (the product page and Edit), even when there is only one.
    ...(images.length > 0 && { imageUrls: images }),
    condition: listing.condition,
    seller: listing.store
      ? { ar: listing.store.nameAr, en: listing.store.nameEn }
      : { ar: listing.sellerUser?.name ?? '', en: listing.sellerUser?.name ?? '' },
    sellerId: listing.storeId ?? listing.sellerUserId ?? '',
    description: listing.description,
    status: listing.status === 'withdrawn' ? 'sold' : listing.status, // never served; type safety
    ...(listing.brand && { brand: listing.brand }),
    ...(listing.model && { model: listing.model }),
    type: listing.type,
    verified: listing.sellerVerified,
    location: place
      ? { id: place.id, name: place.name, governorate: place.governorate }
      : { id: listing.locationId, name: { ar: '', en: '' }, governorate: { ar: '', en: '' } },
    saleType: listing.saleType,
    ...(listing.saleType === 'auction' &&
      listing.auctionEndsAt && {
        auction: {
          endsAt: listing.auctionEndsAt.toISOString(),
          bidCount: listing.bidCount,
          incrementFils: listing.incrementFils ?? 0,
          ...(listing.auctionWinnerId && { winnerId: listing.auctionWinnerId }),
        },
      }),
    views: listing.views,
    ...(listing.storeId && { refurbished: { warrantyMonths: listing.warrantyMonths ?? 0 } }),
    // Buyers only ever get the blurred copy; the original (IMEI visible) is private.
    ...(cert &&
      cert.testedAt &&
      cert.shopName &&
      cert.blurredUrl && {
        testCertificate: {
          imageUrl: absolute(req, cert.blurredUrl),
          shopName: cert.shopName,
          testedAt: cert.testedAt.toISOString(),
          specs: cert.specs,
        },
      }),
  };
}
