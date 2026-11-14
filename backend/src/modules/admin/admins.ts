import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { currentUser } from '../auth/requireUser';
import { createAdmin } from '../staff/service';
import { adminDid } from './audit';
import { can, permissionsOf } from './permissions';

// The owner's Admins page (BACKEND_PLAN B15.7): add an admin with a type (they
// get the invite code by email and set up 2FA on their first log-in), change
// the type, disable / enable. Nobody changes or disables themselves, and the
// last active owner stays, so the dashboard can't lock itself out.

export const adminAdminsRoutes = Router();

const adminRole = z.enum(['owner', 'operations', 'support', 'finance']);

const toApi = (u: {
  id: string;
  name: string;
  email: string | null;
  adminRole: z.infer<typeof adminRole> | null;
  suspended: boolean;
  totpEnabledAt: Date | null;
  createdAt: Date;
}) => ({
  id: u.id,
  name: u.name,
  email: u.email ?? '',
  adminRole: u.adminRole,
  permissions: permissionsOf(u.adminRole),
  active: !u.suspended,
  twoFactor: !!u.totpEnabledAt,
  createdAt: u.createdAt.toISOString(),
});

adminAdminsRoutes.get('/admin/admins', ...can('admins'), async (_req, res) => {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
  res.json(admins.map(toApi));
});

adminAdminsRoutes.post('/admin/admins', ...can('admins'), async (req, res) => {
  const { name, email, adminRole: role } = z
    .object({ name: z.string(), email: z.string(), adminRole: adminRole })
    .parse(req.body);
  const admin = await createAdmin({ name, email }, role);
  await adminDid(req, res, 'admin.create', { type: 'user', id: admin.id }, { email: admin.email, adminRole: role });
  res.status(201).json(toApi(admin));
});

/** Another admin, and a guard against removing the last active owner. */
async function otherAdmin(meId: string, id: string, losingOwner: boolean) {
  if (id === meId) throw new ApiError(422, 'VALIDATION', 'You can’t change your own admin account');
  const admin = await prisma.user.findUnique({ where: { id } });
  if (!admin || admin.role !== 'admin') throw new ApiError(404, 'NOT_FOUND', `No admin ${id}`);
  if (losingOwner && admin.adminRole === 'owner' && !admin.suspended) {
    const owners = await prisma.user.count({ where: { role: 'admin', adminRole: 'owner', suspended: false } });
    if (owners <= 1) throw new ApiError(422, 'VALIDATION', 'Madmoon Deals needs at least one active owner');
  }
  return admin;
}

adminAdminsRoutes.post('/admin/admins/:id/role', ...can('admins'), async (req, res) => {
  const { adminRole: role } = z.object({ adminRole }).parse(req.body);
  const before = await otherAdmin(currentUser(res.locals).id, req.params.id as string, role !== 'owner');
  const admin = await prisma.user.update({ where: { id: before.id }, data: { adminRole: role } });
  // Their open dashboard sessions pick the new permissions up on the next request.
  await adminDid(req, res, 'admin.role', { type: 'user', id: admin.id }, { before: before.adminRole, after: role });
  res.json(toApi(admin));
});

adminAdminsRoutes.post('/admin/admins/:id/disable', ...can('admins'), async (req, res) => {
  const before = await otherAdmin(currentUser(res.locals).id, req.params.id as string, true);
  const [admin] = await prisma.$transaction([
    prisma.user.update({ where: { id: before.id }, data: { suspended: true } }),
    prisma.session.deleteMany({ where: { userId: before.id } }),
  ]);
  await adminDid(req, res, 'admin.disable', { type: 'user', id: admin.id }, {});
  res.json(toApi(admin));
});

adminAdminsRoutes.post('/admin/admins/:id/enable', ...can('admins'), async (req, res) => {
  const before = await otherAdmin(currentUser(res.locals).id, req.params.id as string, false);
  const admin = await prisma.user.update({ where: { id: before.id }, data: { suspended: false } });
  await adminDid(req, res, 'admin.enable', { type: 'user', id: admin.id }, {});
  res.json(toApi(admin));
});
