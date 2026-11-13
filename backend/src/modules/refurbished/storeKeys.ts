import { createHash, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';

// A brand's system calls the import with `Authorization: Bearer sahla_sk_…`.
// Keys are long random strings, so a plain SHA-256 is enough to store them.

const PREFIX = 'sahla_sk_';

export const hashKey = (key: string) =>
  createHash('sha256').update(key).digest('hex');

export const newStoreKey = () => PREFIX + randomBytes(32).toString('base64url');

export type ImportCaller = { storeId: string; source: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      importCaller?: ImportCaller;
    }
  }
}

/**
 * Lets in a store's API key. Admins will come through here too once user
 * sign-in exists (an admin token may import for any store).
 */
export const requireImportCaller: RequestHandler = async (req, res, next) => {
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token?.startsWith(PREFIX))
    throw new ApiError(401, 'UNAUTHORIZED', 'A store API key is required');
  const key = await prisma.storeApiKey.findUnique({
    where: { keyHash: hashKey(token) },
  });
  if (!key || key.revokedAt)
    throw new ApiError(401, 'UNAUTHORIZED', 'Unknown or revoked API key');
  await prisma.storeApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });
  res.locals.importCaller = { storeId: key.storeId, source: `key:${key.label}` };
  next();
};
