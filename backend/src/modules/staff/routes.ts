import { Router } from 'express';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../auth/requireUser';
import { createCourier, disableCourier } from './service';

// Courier accounts from the admin dashboard (BACKEND_PLAN B14.1); the same as
// `npm run staff -- courier|disable|list`. Only the staff email domain; the
// invite code is emailed and the courier chooses a password with it.

export const staffRoutes = Router();

const toApiCourier = (u: { id: string; name: string; email: string | null; suspended: boolean; createdAt: Date }) => ({
  id: u.id,
  name: u.name,
  email: u.email ?? '',
  active: !u.suspended,
  createdAt: u.createdAt.toISOString(),
});

staffRoutes.get('/admin/couriers', ...requireAdmin, async (_req, res) => {
  const couriers = await prisma.user.findMany({ where: { role: 'courier' }, orderBy: { name: 'asc' } });
  res.json(couriers.map(toApiCourier));
});

staffRoutes.post('/admin/couriers', ...requireAdmin, async (req, res) => {
  res.status(201).json(toApiCourier(await createCourier(req.body ?? {})));
});

staffRoutes.post('/admin/couriers/:id/disable', ...requireAdmin, async (req, res) => {
  const courier = await prisma.user.findUnique({ where: { id: req.params.id as string } });
  if (!courier?.email || courier.role !== 'courier') throw new ApiError(404, 'NOT_FOUND', 'No such courier');
  await disableCourier(courier.email);
  res.status(204).end();
});
