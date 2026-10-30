import express from 'express';
import { prisma } from './db';
import { errorHandler, notFound } from './lib/errors';
import { authRoutes } from './modules/auth/routes';
import { referenceRoutes } from './modules/catalog/reference.routes';
import { refurbishedRoutes } from './modules/refurbished/routes';
import { env } from './env';
import { categoryImageDir, demoCertificateDir } from './reference';

export const app = express();
app.disable('x-powered-by');
// Behind a proxy / load balancer in production, set this so req.ip (rate
// limits, sessions) is the user's address, e.g. app.set('trust proxy', 1).

// Files this server hosts (moves to a CDN with photo storage, BACKEND_PLAN B3).
app.use('/static/categories', express.static(categoryImageDir, { maxAge: '7d' }));
if (env.NODE_ENV !== 'production')
  app.use('/static/certificates', express.static(demoCertificateDir, { maxAge: '7d' }));

// Imports send up to 1000 rows; every other endpoint gets small JSON bodies.
app.use('/v1/admin/refurbished', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '64kb' }));

const v1 = express.Router();

// Is the server up, and can it reach the database?
v1.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, database: 'connected' });
});

v1.use(authRoutes);
v1.use(referenceRoutes);
v1.use(refurbishedRoutes);

app.use('/v1', v1);
app.use(notFound);
app.use(errorHandler);
