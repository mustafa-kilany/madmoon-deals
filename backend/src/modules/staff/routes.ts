import { Router } from 'express';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { adminDid } from '../admin/audit';
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
  const courier = await createCourier(req.body ?? {});
  await adminDid(req, res, 'courier.create', { type: 'user', id: courier.id }, { email: courier.email });
  res.status(201).json(toApiCourier(courier));
});

staffRoutes.post('/admin/couriers/:id/disable', ...requireAdmin, async (req, res) => {
  const courier = await prisma.user.findUnique({ where: { id: req.params.id as string } });
  if (!courier?.email || courier.role !== 'courier') throw new ApiError(404, 'NOT_FOUND', 'No such courier');
  await disableCourier(courier.email);
  await adminDid(req, res, 'courier.disable', { type: 'user', id: courier.id });
  res.status(204).end();
});

/** A disabled courier can work again: they log in with their old password (or reset it). */
staffRoutes.post('/admin/couriers/:id/enable', ...requireAdmin, async (req, res) => {
  const courier = await prisma.user.findUnique({ where: { id: req.params.id as string } });
  if (!courier || courier.role !== 'courier') throw new ApiError(404, 'NOT_FOUND', 'No such courier');
  if (!courier.suspended) throw new ApiError(422, 'VALIDATION', 'Already active');
  await prisma.user.update({ where: { id: courier.id }, data: { suspended: false } });
  await adminDid(req, res, 'courier.enable', { type: 'user', id: courier.id });
  res.status(204).end();
});
