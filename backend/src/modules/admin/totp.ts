import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Time-based codes (RFC 6238) for the admin log-in: the same 6 digits every
// 30 seconds as Google Authenticator, Microsoft Authenticator, 1Password…

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;

export function toBase32(bytes: Buffer) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

export function fromBase32(text: string) {
  let bits = '';
  for (const char of text.toUpperCase().replace(/[\s=]/g, '')) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error('Not base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** 160 random bits, as authenticator apps expect. */
export const newTotpSecret = () => toBase32(randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / STEP_MS);

/** The code for one 30-second step (`digits` = 8 only for the RFC's test vectors). */
export function totpCode(secret: string, step: number, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(number).padStart(digits, '0');
}

/**
 * The step whose code this is (now, or one step either side for a slow phone
 * clock), or undefined. The caller refuses steps already used.
 */
export function matchTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return undefined;
  for (const step of [currentStep(now), currentStep(now) - 1, currentStep(now) + 1])
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
  return undefined;
}

/** For the QR code the authenticator app scans. */
export const otpauthUrl = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`Madmoon Deals Admin:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('Madmoon Deals Admin')}&algorithm=SHA1&digits=6&period=30`;
