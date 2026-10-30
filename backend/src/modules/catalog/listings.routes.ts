import { Router } from 'express';
import { listingQuery } from './listingQuery';
import { searchListings } from './listings.service';

// docs/API.md → Catalog: GET /listings.

export const listingRoutes = Router();

listingRoutes.get('/listings', async (req, res) => {
  const query = listingQuery.parse(req.query);
  res.json(await searchListings(query, req));
});
