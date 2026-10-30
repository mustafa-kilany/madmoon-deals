import { prisma } from '../../db';
import type { User } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { itemInclude } from '../catalog/apiItem';
import { searchTextFor } from '../catalog/searchText';
import type { NewListing } from './rules';

const invalid = (message: string) => new ApiError(422, 'VALIDATION', message);

/**
 * The listing photos in the request, as the stored paths (/files/listings/…).
 * Only photos this user uploaded with POST /uploads/listing-photo and that no
 * listing uses yet.
 */
async function ownPhotos(userId: string, urls: string[]) {
  const paths = urls.map(url => new URL(url).pathname);
  if (new Set(paths).size !== paths.length) throw invalid('imageUrls: the same photo twice');
  const uploads = await prisma.upload.findMany({
    where: { url: { in: paths }, userId, kind: 'listing', usedAt: null },
    select: { id: true },
  });
  if (uploads.length !== paths.length)
    throw invalid('imageUrls: upload each photo with POST /uploads/listing-photo first');
  return { paths, uploadIds: uploads.map(u => u.id) };
}

/** POST /listings (BACKEND_PLAN B4.1). */
export async function createListing(seller: User, input: NewListing) {
  const { paths, uploadIds } = await ownPhotos(seller.id, input.imageUrls);
  const auction = input.saleType === 'auction';
  return prisma.$transaction(async tx => {
    const listing = await tx.listing.create({
      data: {
        category: input.category,
        type: input.type,
        titleAr: input.titleAr,
        titleEn: input.titleEn,
        priceFils: input.priceFils, // auctions: the starting bid
        imageUrls: paths,
        condition: input.condition,
        description: input.description,
        brand: input.brand,
        model: input.model,
        locationId: input.locationId,
        saleType: input.saleType,
        auctionEndsAt: auction ? new Date(input.auctionEndsAt!) : null,
        incrementFils: auction ? (input.incrementFils ?? 1000) : null,
        searchText: searchTextFor(input),
        sellerVerified: seller.verified,
        sellerUserId: seller.id,
      },
      include: itemInclude,
    });
    const used = await tx.upload.updateMany({
      where: { id: { in: uploadIds }, usedAt: null },
      data: { usedAt: new Date() },
    });
    // Two publishes racing for the same photos: only the first gets them.
    if (used.count !== uploadIds.length) throw invalid('imageUrls: a photo is already on another listing');
    return listing;
  });
}

/** The seller's own listing that is still for sale, or why not. */
async function ownActiveListing(sellerId: string, id: string) {
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.status === 'withdrawn') throw new ApiError(404, 'NOT_FOUND', `No listing ${id}`);
  if (listing.sellerUserId !== sellerId) throw new ApiError(403, 'FORBIDDEN', 'Not your listing');
  if (listing.status === 'reserved')
    throw new ApiError(409, 'OPEN_ORDERS', 'This listing is paid for and waiting for delivery');
  if (listing.status === 'sold') throw new ApiError(409, 'ITEM_UNAVAILABLE', 'This listing is sold');
  return listing;
}

/** PATCH /listings/:id: price and condition (B4.2). An auction's price is fixed once bidding starts. */
export async function updateListing(sellerId: string, id: string, patch: { priceFils?: number; condition?: NewListing['condition'] }) {
  const listing = await ownActiveListing(sellerId, id);
  if (patch.priceFils !== undefined && listing.saleType === 'auction' && listing.bidCount > 0)
    throw invalid('priceFils: an auction with bids keeps its price');
  return prisma.listing.update({ where: { id }, data: patch, include: itemInclude });
}

/** DELETE /listings/:id: withdrawn, never shown again (B4.2). Not once paid for, nor an auction with bids. */
export async function withdrawListing(sellerId: string, id: string) {
  const listing = await ownActiveListing(sellerId, id);
  if (listing.saleType === 'auction' && listing.bidCount > 0)
    throw invalid('An auction with bids can’t be withdrawn');
  await prisma.listing.update({ where: { id }, data: { status: 'withdrawn' } });
}
