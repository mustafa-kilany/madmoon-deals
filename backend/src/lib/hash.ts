import { createHmac } from 'node:crypto';
import { env } from '../env';

/**
 * A keyed hash for numbers we must recognise again but never store: national ID
 * numbers (Sanad), IMEI / serial numbers on test certificates. `label` keeps the
 * kinds apart. ID_HASH_SECRET must never change once set (the JWT secret until then).
 */
export const keyedHash = (label: string, value: string) =>
  createHmac('sha256', env.ID_HASH_SECRET ?? env.JWT_SECRET).update(`${label}:${value}`).digest('hex');
