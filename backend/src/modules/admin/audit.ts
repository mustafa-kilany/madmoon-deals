import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { currentUser } from '../auth/requireUser';
import { can } from './permissions';

// The audit log (BACKEND_PLAN B8.1): one AdminAction row for every change an
// admin makes. Written after the change succeeded; rows are never edited.

export type AuditTarget = { type: string; id: string };

export async function logAdminAction(
  adminId: string,
  req: Request,
  action: string,
  target?: AuditTarget,
  details?: Prisma.InputJsonValue,
) {
  await prisma.adminAction.create({
    data: { adminId, action, targetType: target?.type, targetId: target?.id, details, ip: req.ip },
  });
}

/** In an admin route: logs as the signed-in admin. */
export const adminDid = (req: Request, res: Response, action: string, target?: AuditTarget, details?: Prisma.InputJsonValue) =>
  logAdminAction(currentUser(res.locals).id, req, action, target, details);

export const auditRoutes = Router();

const listQuery = z.object({
  targetType: z.string().max(40).optional(),
  targetId: z.string().max(100).optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Newest first; `before` = the last row's createdAt for the next page. */
auditRoutes.get('/admin/actions', ...can('orders'), async (req, res) => {
  const q = listQuery.parse(req.query);
  const rows = await prisma.adminAction.findMany({
    where: {
      ...(q.targetType && { targetType: q.targetType }),
      ...(q.targetId && { targetId: q.targetId }),
      ...(q.before && { createdAt: { lt: new Date(q.before) } }),
    },
    include: { admin: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: q.limit,
  });
  res.json(
    rows.map(row => ({
      id: row.id,
      admin: row.admin ? { id: row.adminId, name: row.admin.name, email: row.admin.email ?? '' } : null,
      action: row.action,
      ...(row.targetType && { target: { type: row.targetType, id: row.targetId ?? '' } }),
      ...(row.details !== null && { details: row.details }),
      createdAt: row.createdAt.toISOString(),
    })),
  );
});
