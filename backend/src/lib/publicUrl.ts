import type { Request } from 'express';
import { env } from '../env';

/**
 * Absolute URL of a file this server hosts. PUBLIC_URL in production
 * (https://api.sahla.jo); otherwise the address the caller used, so the
 * Android emulator gets http://10.0.2.2:4000/… and a browser localhost.
 */
export const publicUrl = (req: Request, path: string) =>
  `${env.PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`}${path}`;
