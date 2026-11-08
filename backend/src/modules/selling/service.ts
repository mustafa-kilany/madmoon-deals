import { prisma } from '../../db';
import { Prisma, type User } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { storedPath } from '../../lib/publicUrl';
import { findType } from '../../reference';
import { itemInclude } from '../catalog/apiItem';
import { searchTextFor } from '../catalog/searchText';
import { listingPickupColumns, type PickupInput } from '../orders/delivery';
import type { ListingPatch, NewListing } from './rules';

const invalid = (message: string) => new ApiError(422, 'VALIDATION', message);

/**
 * The listing photos in the request, as the stored paths (/files/listings/…).
 * Only photos this user uploaded with POST /uploads/listing-photo and that no
 * listing uses yet.
 */
async function ownPhotos(userId: string, urls: string[]) {
  const paths = urls.map(storedPath);
  if (new Set(paths).size !== paths.length) throw invalid('imageUrls: the same photo twice');
  const uploads = await prisma.upload.findMany({
    where: { url: { in: paths }, userId, kind: 'listing', usedAt: null },
    select: { id: true },
  });
  if (uploads.length !== paths.length)
    throw invalid('imageUrls: upload each photo with POST /uploads/listing-photo first');
  return { paths, uploadIds: uploads.map(u => u.id) };
}

/**
 * Phones and electronics (requiresTestCertificate): a certificate from
 * POST /test-certificates that is the seller's, passed, on no other listing, and
 * checked for this type, brand and model (B4.5). Other types: none.
 */
async function certificateFor(sellerId: string, input: NewListing) {
  if (!findType(input.category, input.type)?.requiresTestCertificate) return undefined;
  const cert = input.testCertificateId
    ? await prisma.testCertificate.findUnique({
        where: { id: input.testCertificateId },
        include: { listing: { select: { id: true } } },
      })
    : null;
  const sameDevice =
    cert?.category === input.category &&
    cert.type === input.type &&
    cert.brand === input.brand &&
    (cert.model ?? undefined) === input.model;
  if (!cert || cert.userId !== sellerId || cert.status !== 'passed' || cert.listing || !sameDevice)
    throw invalid('testCertificateId: a passed test certificate for this device is required');
  return cert.id;
}

/** POST /listings (BACKEND_PLAN B4.1). */
export async function createListing(seller: User, input: NewListing) {
  const { paths, uploadIds } = await ownPhotos(seller.id, input.imageUrls);
  const testCertificateId = await certificateFor(seller.id, input);
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
        testCertificateId,
        ...listingPickupColumns(input.pickup),
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
  }).catch(error => {
    // Listing.testCertificateId is unique: two publishes racing for one certificate.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw invalid('testCertificateId: this certificate is on another listing');
    throw error;
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

/** Paths of the photos in a request (stored as /files/…, sent back as full URLs). */
const pathsOf = (urls: string[]) => urls.map(storedPath);

/**
 * B15.2: the edited photo list. Photos already on the listing stay; new ones must be
 * this seller's unused uploads; dropped ones are let go (the clean-up job deletes them).
 */
async function editedPhotos(sellerId: string, current: string[], urls: string[]) {
  const paths = pathsOf(urls);
  if (new Set(paths).size !== paths.length) throw invalid('imageUrls: the same photo twice');
  const added = paths.filter(p => !current.includes(p));
  const { uploadIds } = added.length ? await ownPhotos(sellerId, added.map(p => `http://x${p}`)) : { uploadIds: [] };
  const dropped = current.filter(p => !paths.includes(p));
  return { paths, uploadIds, dropped };
}

/**
 * PATCH /listings/:id: title, description, photos, price, condition and the pickup
 * (B4.2, B14.5, B15.2). An auction with bids keeps everything buyers bid on: only
 * its pickup can change. An auction's
 * price is fixed once bidding starts. A new pickup is for orders from now on:
 * an order keeps the one it was placed with.
 */
export async function updateListing(
  sellerId: string,
  id: string,
  { pickup, imageUrls, ...patch }: ListingPatch,
) {
  const listing = await ownActiveListing(sellerId, id);
  const changesItem = imageUrls !== undefined || Object.values(patch).some(v => v !== undefined);
  if (changesItem && listing.saleType === 'auction' && listing.bidCount > 0)
    throw invalid(
      patch.priceFils !== undefined
        ? 'priceFils: an auction with bids keeps its price'
        : 'An auction with bids can only change its pickup',
    );
  const photos = imageUrls && (await editedPhotos(sellerId, listing.imageUrls, imageUrls));
  const titles = { titleAr: patch.titleAr ?? listing.titleAr, titleEn: patch.titleEn ?? listing.titleEn };
  return prisma.$transaction(async tx => {
    if (photos?.uploadIds.length) {
      const used = await tx.upload.updateMany({ where: { id: { in: photos.uploadIds }, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== photos.uploadIds.length) throw invalid('imageUrls: a photo is already on another listing');
    }
    if (photos?.dropped.length)
      await tx.upload.updateMany({ where: { url: { in: photos.dropped }, userId: sellerId, kind: 'listing' }, data: { usedAt: null } });
    return tx.listing.update({
      where: { id },
      data: {
        ...patch,
        ...(photos && { imageUrls: photos.paths }),
        ...((patch.titleAr || patch.titleEn) && { searchText: searchTextFor({ ...listing, ...titles }) }),
        ...(pickup && listingPickupColumns(pickup)),
      },
      include: itemInclude,
    });
  });
}

/** How long an auction's winner has to pay before the seller may take the item back. */
export const UNPAID_WIN_MS = 48 * 3_600_000;

/**
 * DELETE /listings/:id: withdrawn, never shown again (B4.2). Not once paid for, nor an
 * auction with bids, unless it ended over 48 hours ago and the winner never paid.
 */
export async function withdrawListing(sellerId: string, id: string) {
  const listing = await ownActiveListing(sellerId, id);
  const unpaidWin = listing.auctionClosedAt && Date.now() - listing.auctionClosedAt.getTime() >= UNPAID_WIN_MS;
  if (listing.saleType === 'auction' && listing.bidCount > 0 && !unpaidWin)
    throw invalid(listing.auctionClosedAt ? 'The winner has 48 hours to pay: withdraw it after that' : 'An auction with bids can’t be withdrawn');
  await prisma.listing.update({ where: { id }, data: { status: 'withdrawn' } });
}
