import type { RequestHandler } from 'express';
import type { AdminRole } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { currentUser, requireAdmin } from '../auth/requireUser';

// Admin types (BACKEND_PLAN B15.7). Every dashboard endpoint names the one
// permission it needs; the dashboard shows each admin only the pages their
// permissions open (GET /admin/me → permissions). An admin without a type can
// do nothing but sign in and out.

export const PERMISSIONS = [
  'orders', // see orders, users and the overview (every admin)
  'dispatch', // assign drivers, unlock a PIN, retry a delivery problem
  'refund', // money back to a buyer (also a delivery problem's refund)
  'payouts', // sellers' money: list, mark sent
  'analytics',
  'reports', // reported listings and accounts
  'risk', // suspicious accounts
  'certificates', // test certificate stamps
  'suspend', // suspend / unsuspend accounts
  'stores', // Certified Refurbished stores, keys, imports
  'categories', // category pictures
  'couriers', // driver accounts
  'support', // the support chat (B15.6)
  'admins', // add admins, change their type, disable them
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  operations: ['orders', 'dispatch', 'stores', 'categories', 'couriers'],
  support: ['orders', 'dispatch', 'reports', 'risk', 'certificates', 'suspend', 'support'],
  finance: ['orders', 'refund', 'payouts', 'analytics'],
};

export const permissionsOf = (role: AdminRole | null | undefined): readonly Permission[] =>
  role ? ROLE_PERMISSIONS[role] : [];

export const allowed = (role: AdminRole | null | undefined, permission: Permission) =>
  permissionsOf(role).includes(permission);

/** A dashboard endpoint that needs `permission` (after the usual admin checks). */
export const can = (permission: Permission): RequestHandler[] => [
  ...requireAdmin,
  (_req, res, next) => {
    if (!allowed(currentUser(res.locals).adminRole, permission))
      throw new ApiError(403, 'FORBIDDEN', `Your admin type can’t do this (${permission})`);
    next();
  },
];
