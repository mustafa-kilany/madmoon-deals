import express from 'express';
import { prisma } from './db';
import { errorHandler, notFound } from './lib/errors';
import { authRoutes } from './modules/auth/routes';
import { certificateRoutes } from './modules/certificates/routes';
import { courierRoutes } from './modules/courier/routes';
import { geocodeRoutes } from './modules/geocode/routes';
import { identityRoutes } from './modules/identity/routes';
import { listingRoutes } from './modules/catalog/listings.routes';
import { referenceRoutes } from './modules/catalog/reference.routes';
import { refurbishedRoutes } from './modules/refurbished/routes';
import { negotiationRoutes } from './modules/negotiation/routes';
import { adminOrderRoutes } from './modules/orders/admin';
import { orderRoutes } from './modules/orders/routes';
import { cardRoutes } from './modules/payments/card';
import { paymentRoutes } from './modules/payments/routes';
import { safetyRoutes } from './modules/safety/routes';
import { sellingRoutes } from './modules/selling/routes';
import { uploadRoutes } from './modules/uploads/routes';
import { uploadDir } from './lib/storage';
import { env } from './env';
import { categoryImageDir, demoCertificateDir } from './reference';

export const app = express();
app.disable('x-powered-by');
// Behind a proxy / load balancer in production, set this so req.ip (rate
// limits, sessions) is the user's address, e.g. app.set('trust proxy', 1).

// Files this server hosts (moves to a CDN with photo storage, BACKEND_PLAN B3).
app.use('/static/categories', express.static(categoryImageDir, { maxAge: '7d' }));
// Uploaded photos (development; production: cloud storage, D1). Names are random.
app.use('/files', express.static(uploadDir, { maxAge: '30d', immutable: true }));
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
v1.use(listingRoutes);
v1.use(sellingRoutes);
v1.use(certificateRoutes);
v1.use(safetyRoutes);
v1.use(negotiationRoutes);
v1.use(orderRoutes);
v1.use(adminOrderRoutes);
v1.use(paymentRoutes);
v1.use(cardRoutes);
v1.use(courierRoutes);
v1.use(geocodeRoutes);
v1.use(refurbishedRoutes);
v1.use(uploadRoutes);
v1.use(identityRoutes);

app.use('/v1', v1);
app.use(notFound);
app.use(errorHandler);
