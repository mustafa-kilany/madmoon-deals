import type { RequestHandler } from 'express';
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

/** The signed-in user, after requireUser. */
export const currentUser = (locals: Express.Locals) => locals.user!;
