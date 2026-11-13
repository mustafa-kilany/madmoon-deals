import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../env';

// Secrets the server must read back, so they can't be hashed. AES-256-GCM.
// - seal / unseal: admins' 2FA secrets, key from JWT_SECRET: changing that secret means
//   admins set up 2FA again (it signs everyone out anyway).
// - dataSeal / dataUnseal: people's data that must survive changing JWT_SECRET after a
//   leak (sellers' IBANs), key from ID_HASH_SECRET, which never changes.

const keyFrom = (secret: string, label: string) => Buffer.from(hkdfSync('sha256', secret, '', label, 32));
const key = keyFrom(env.JWT_SECRET, 'sahla-sealed-v1');
const dataKey = keyFrom(env.ID_HASH_SECRET ?? env.JWT_SECRET, 'sahla-data-v1');

export const seal = (text: string) => sealWith(key, text);
export const unseal = (sealed: string) => unsealWith(key, sealed);
export const dataSeal = (text: string) => sealWith(dataKey, text);
export const dataUnseal = (sealed: string) => unsealWith(dataKey, sealed);

function sealWith(key: Buffer, text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map(p => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/** The text, or undefined when it was sealed with another key or changed. */
function unsealWith(key: Buffer, sealed: string) {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) return undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}
