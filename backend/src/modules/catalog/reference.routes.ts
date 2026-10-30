import { Router } from 'express';
import { prisma } from '../../db';
import { publicUrl } from '../../lib/publicUrl';
import { categoryFilters, categoryInfo, cities } from '../../reference';

// docs/API.md → Catalog: GET /categories, /categories/filters, /cities.
// The same data as the app's mock (shared files), so ids always match.

export const referenceRoutes = Router();

// Cities and item types change only with a deploy: phones may cache them for an hour.
// Category pictures can be changed by an admin, so those for 10 minutes.
referenceRoutes.use('/cities', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=3600');
  next();
});
referenceRoutes.use('/categories', (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${req.path === '/' ? 600 : 3600}`);
  next();
});

// An admin's picture (Category table, B3.7) wins over the bundled tile.
referenceRoutes.get('/categories', async (req, res) => {
  const custom = new Map(
    (await prisma.category.findMany()).map(c => [c.id, c.imageUrl]),
  );
  res.json(
    categoryInfo.map(category => ({
      ...category,
      imageUrl: publicUrl(req, custom.get(category.id) ?? `/static/categories/${category.id}.jpg`),
    })),
  );
});

referenceRoutes.get('/categories/filters', (_req, res) => {
  res.json(categoryFilters);
});

referenceRoutes.get('/cities', (_req, res) => {
  res.json(cities);
});
