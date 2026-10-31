import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../env';

// Secrets the server must read back, so they can't be hashed: admins' 2FA
// secrets. AES-256-GCM with a key derived from JWT_SECRET; changing that secret
// means admins set up 2FA again (it signs everyone out anyway).

const key = Buffer.from(hkdfSync('sha256', env.JWT_SECRET, '', 'sahla-sealed-v1', 32));

export function seal(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map(p => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/** The text, or undefined when it was sealed with another key or changed. */
export function unseal(sealed: string) {
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
