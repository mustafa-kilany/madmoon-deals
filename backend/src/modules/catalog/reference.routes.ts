import { Router } from 'express';
import { publicUrl } from '../../lib/publicUrl';
import { categoryFilters, categoryInfo, cities } from '../../reference';

// docs/API.md → Catalog: GET /categories, /categories/filters, /cities.
// The same data as the app's mock (shared files), so ids always match.

export const referenceRoutes = Router();

// Changes only with a deploy: let phones cache it for an hour.
referenceRoutes.use(['/categories', '/cities'], (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=3600');
  next();
});

referenceRoutes.get('/categories', (req, res) => {
  res.json(
    categoryInfo.map(category => ({
      ...category,
      imageUrl: publicUrl(req, `/static/categories/${category.id}.jpg`),
    })),
  );
});

referenceRoutes.get('/categories/filters', (_req, res) => {
  res.json(categoryFilters);
});

referenceRoutes.get('/cities', (_req, res) => {
  res.json(cities);
});
