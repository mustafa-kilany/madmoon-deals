import { Router } from 'express';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { currentUser, optionalUserId, requireCustomer } from '../auth/requireUser';
import { itemInclude, toApiItem } from './apiItem';
import { listingQuery } from './listingQuery';
import { searchListings } from './listings.service';

// docs/API.md → Catalog: GET /listings, GET /listings/:id, POST /listings/:id/views,
// GET /me/listings.

export const listingRoutes = Router();

const notFound = (id: string) => new ApiError(404, 'NOT_FOUND', `No listing ${id}`);

listingRoutes.get('/listings', async (req, res) => {
  const query = listingQuery.parse(req.query);
  res.json(await searchListings(query, req));
});

// Reserved and sold listings still open (saved items, order history); deleted ones don't.
listingRoutes.get('/listings/:id', async (req, res) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: itemInclude,
  });
  if (!listing || listing.status === 'withdrawn') throw notFound(req.params.id);
  res.json(toApiItem(listing, req));
});

// Signed in or not. Each viewer counts once a day: the user, else the phone
// (X-Device-Id), else the IP address.
listingRoutes.post('/listings/:id/views', async (req, res) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true },
  });
  if (!listing || listing.status === 'withdrawn') throw notFound(req.params.id);

  const userId = await optionalUserId(req);
  const viewerKey = userId
    ? `user:${userId}`
    : req.get('x-device-id')
      ? `device:${req.get('x-device-id')!.slice(0, 128)}`
      : `ip:${req.ip}`;
  const today = new Date(new Date().toISOString().slice(0, 10)); // UTC date

  const { count } = await prisma.listingView.createMany({
    data: [{ listingId: listing.id, viewerKey, day: today }],
    skipDuplicates: true,
  });
  if (count > 0)
    await prisma.listing.update({
      where: { id: listing.id },
      data: { views: { increment: 1 } },
    });
  res.status(204).end();
});

// The seller's own listings, every status but deleted, newest first.
listingRoutes.get('/me/listings', ...requireCustomer, async (req, res) => {
  const rows = await prisma.listing.findMany({
    where: { sellerUserId: currentUser(res.locals).id, status: { not: 'withdrawn' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: itemInclude,
  });
  res.json(rows.map(row => toApiItem(row, req)));
});
