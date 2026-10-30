import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Passwords are stored as scrypt hashes (built into Node, nothing to compile):
//   scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
// The cost is stored with each hash, so it can be raised later without
// breaking old passwords.

const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LENGTH = 64;

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function passwordMatches(password: string, stored: string | null): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored?.split('$') ?? [];
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: COST.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * For log-in with an unknown email: spend the same time as a real check, so
 * response times don't reveal which emails have accounts.
 */
const dummy = hashPassword('not a real password');
export const burnPasswordCheck = async (password: string) =>
  void (await passwordMatches(password, await dummy));
