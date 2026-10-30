import type { Request, RequestHandler } from 'express';
import type { User } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { sessionForToken } from './tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: User;
      sessionId?: string;
    }
  }
}

/**
 * For authenticated endpoints: a missing, invalid, expired or revoked token
 * is 401 UNAUTHORIZED (the app then signs out). Routes read res.locals.user.
 */
export const requireUser: RequestHandler = async (req, res, next) => {
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  const session = token ? await sessionForToken(token) : undefined;
  if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');
  // 403, not 401: a suspended user shouldn't be bounced in a sign-out loop.
  if (session.user.suspended)
    throw new ApiError(403, 'FORBIDDEN', 'This account is suspended');
  res.locals.user = session.user;
  res.locals.sessionId = session.id;
  next();
};

/** Endpoints anyone can call: the caller's user id when a valid token is sent. */
export async function optionalUserId(req: Request) {
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  return token ? (await sessionForToken(token))?.userId : undefined;
}

/** The signed-in user, after requireUser. */
export const currentUser = (locals: Express.Locals) => locals.user!;

/** Buying, selling, chats, uploads: signed-in customers only (couriers get FORBIDDEN, B14.2). */
export const requireCustomer: RequestHandler[] = [
  requireUser,
  (_req, res, next) => {
    if (currentUser(res.locals).role === 'courier')
      throw new ApiError(403, 'FORBIDDEN', 'Courier accounts can only deliver');
    next();
  },
];

/** Admin-only endpoints (/v1/admin/*). */
export const requireAdmin: RequestHandler[] = [
  requireUser,
  (_req, res, next) => {
    if (currentUser(res.locals).role !== 'admin')
      throw new ApiError(403, 'FORBIDDEN', 'Admins only');
    next();
  },
];
