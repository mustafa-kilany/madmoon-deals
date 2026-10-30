import { Router } from 'express';
import { toApiItem } from '../catalog/apiItem';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { listingPatch, newListing } from './rules';
import { createListing, updateListing, withdrawListing } from './service';

// docs/API.md → Phase 4: Selling (BACKEND_PLAN B4.1, B4.2).

export const sellingRoutes = Router();

sellingRoutes.post('/listings', ...requireCustomer, async (req, res) => {
  const listing = await createListing(currentUser(res.locals), newListing.parse(req.body));
  res.status(201).json(toApiItem(listing, req));
});

sellingRoutes.patch('/listings/:id', ...requireCustomer, async (req, res) => {
  const listing = await updateListing(currentUser(res.locals).id, req.params.id as string, listingPatch.parse(req.body));
  res.json(toApiItem(listing, req));
});

sellingRoutes.delete('/listings/:id', ...requireCustomer, async (req, res) => {
  await withdrawListing(currentUser(res.locals).id, req.params.id as string);
  res.status(204).end();
});
