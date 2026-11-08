import { Router } from 'express';
import { logger } from '../../lib/logger';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { geocoder, inJordan } from './geocoder';

// docs/API.md → Phase 6 → GET /geocode/reverse (BACKEND_PLAN B7.1).

export const geocodeRoutes = Router();

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  lang: z.enum(['ar', 'en']).default('ar'),
});

// 20 an hour per user: checkout asks once, the "Use my location" button a few times.
const perUser = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (_req, res) => currentUser(res.locals).id,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many location lookups: try again later' } }),
});

geocodeRoutes.get('/geocode/reverse', ...requireCustomer, perUser, async (req, res) => {
  const { lat, lng, lang } = query.parse(req.query);
  const maps = geocoder();
  let address = '';
  if (maps && inJordan({ lat, lng })) {
    try {
      address = await maps.street({ lat, lng }, lang);
    } catch (error) {
      // Never the coordinates in the log. The buyer still gets the area.
      logger.warn({ err: error }, 'Reverse geocoding failed');
    }
  }
  res.set('Cache-Control', 'private, no-store').json({ address });
});
