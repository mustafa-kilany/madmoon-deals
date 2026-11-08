import express from 'express';
import helmet from 'helmet';
import { prisma } from './db';
import { errorHandler, notFound } from './lib/errors';
import { requestLogger } from './lib/logger';
import { adminAdminsRoutes } from './modules/admin/admins';
import { adminAnalyticsRoutes } from './modules/admin/analytics';
import { adminAuthRoutes } from './modules/admin/auth';
import { auditRoutes } from './modules/admin/audit';
import { adminOrdersRoutes } from './modules/admin/orders';
import { adminQueueRoutes } from './modules/admin/queues';
import { statsRoutes } from './modules/admin/stats';
import { adminStoreRoutes } from './modules/admin/stores';
import { adminUsersRoutes } from './modules/admin/users';
import { authRoutes } from './modules/auth/routes';
import { certificateRoutes } from './modules/certificates/routes';
import { courierRoutes } from './modules/courier/routes';
import { geocodeRoutes } from './modules/geocode/routes';
import { identityRoutes } from './modules/identity/routes';
import { legalRoutes } from './modules/legal/routes';
import { listingRoutes } from './modules/catalog/listings.routes';
import { referenceRoutes } from './modules/catalog/reference.routes';
import { refurbishedRoutes } from './modules/refurbished/routes';
import { negotiationRoutes } from './modules/negotiation/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { adminOrderRoutes } from './modules/orders/admin';
import { orderRoutes } from './modules/orders/routes';
import { cardRoutes } from './modules/payments/card';
import { paymentRoutes } from './modules/payments/routes';
import { payoutAccountRoutes } from './modules/payouts/account';
import { safetyRoutes } from './modules/safety/routes';
import { sellingRoutes } from './modules/selling/routes';
import { staffRoutes } from './modules/staff/routes';
import { supportRoutes } from './modules/support/routes';
import { uploadRoutes } from './modules/uploads/routes';
import { uploadDir } from './lib/storage';
import { env } from './env';
import { categoryImageDir, demoCertificateDir } from './reference';

export const app = express();
app.disable('x-powered-by');
// Behind a proxy / load balancer: req.ip (rate limits, sessions) is then the user's address.
if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
// Security headers. The API serves JSON plus a few small pages (bank / Sanad
// callbacks) and photos the app loads from another origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(requestLogger);

// S0.8: only the dashboard's own website may call the admin API from a browser. The
// phone app needs no CORS; any other origin gets no Access-Control headers at all.
app.use('/v1/admin', (req, res, next) => {
  const origin = req.get('origin');
  if (!origin || origin !== env.ADMIN_ORIGIN) return next();
  res.set({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  });
  if (req.method === 'OPTIONS') return void res.status(204).end();
  next();
});

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
v1.use(adminAuthRoutes);
v1.use(adminAdminsRoutes);
v1.use(auditRoutes);
v1.use(statsRoutes);
v1.use(adminAnalyticsRoutes);
v1.use(adminOrdersRoutes);
v1.use(adminUsersRoutes);
v1.use(adminQueueRoutes);
v1.use(adminStoreRoutes);
v1.use(legalRoutes);
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
v1.use(payoutAccountRoutes);
v1.use(courierRoutes);
v1.use(geocodeRoutes);
v1.use(staffRoutes);
v1.use(notificationRoutes);
v1.use(supportRoutes);
v1.use(refurbishedRoutes);
v1.use(uploadRoutes);
v1.use(identityRoutes);

app.use('/v1', v1);
app.use(notFound);
app.use(errorHandler);
