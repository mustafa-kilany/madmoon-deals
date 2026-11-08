import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AwsClient } from 'aws4fetch';
import { env } from '../env';

// Where uploaded files live (SECURITY_PLAN S0.5, BACKEND_PLAN D1).
// STORAGE=local: the backend/uploads folders, for development.
// STORAGE=s3: any S3-compatible service (Cloudflare R2, AWS S3, MinIO). A public
// bucket for photos, a private one for test certificate originals (IMEI and serial
// numbers), which only ever leave through the admin-only endpoint.
//
// The database always stores the same location-independent names: "/files/listings/x.jpg"
// and "private:certificates/x.jpg". lib/publicUrl.ts turns the first kind into a URL.

export interface Storage {
  /** Saves the file and returns what to store in the database. */
  put(key: string, data: Buffer): Promise<string>;
  remove(ref: string): Promise<void>;
}
export interface PrivateStorage extends Storage {
  /** The file's bytes, or undefined when there is no such file. */
  read(ref: string): Promise<Buffer | undefined>;
}

const PUBLIC_PREFIX = '/files/';
const PRIVATE_PREFIX = 'private:';

/** The keys Sahla makes are random names: this refuses anything that could climb out of a folder. */
const safeKey = (key: string) => (key && !key.split('/').some(part => part === '..' || part === '') ? key : undefined);

export const uploadDir = fileURLToPath(new URL('../../uploads', import.meta.url));
export const privateDir = fileURLToPath(new URL('../../uploads-private', import.meta.url));

const localFile = (root: string, key: string) => {
  const file = path.resolve(root, key);
  return safeKey(key) && file.startsWith(root + path.sep) ? file : undefined;
};

const localPublic: Storage = {
  async put(key, data) {
    const file = path.join(uploadDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return PUBLIC_PREFIX + key;
  },
  async remove(ref) {
    if (!ref.startsWith(PUBLIC_PREFIX)) return;
    const file = localFile(uploadDir, ref.slice(PUBLIC_PREFIX.length));
    if (file) await rm(file, { force: true });
  },
};

const localPrivate: PrivateStorage = {
  async put(key, data) {
    const file = path.join(privateDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return PRIVATE_PREFIX + key;
  },
  async remove(ref) {
    const file = privateFilePath(ref);
    if (file) await rm(file, { force: true });
  },
  async read(ref) {
    const file = privateFilePath(ref);
    return file ? readFile(file).catch(() => undefined) : undefined;
  },
};

/** Local storage only: the file behind a private ref ("private:…"), never outside the folder. */
export function privateFilePath(ref: string): string | undefined {
  return ref.startsWith(PRIVATE_PREFIX) ? localFile(privateDir, ref.slice(PRIVATE_PREFIX.length)) : undefined;
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const contentType = (key: string) => TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
const TIMEOUT_MS = 30_000;

/** One S3 bucket, addressed by path (https://endpoint/bucket/key): R2, S3 and MinIO all accept it. */
function s3Bucket(bucket: string, cacheControl: string) {
  const client = new AwsClient({
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    service: 's3',
    region: env.S3_REGION,
    retries: 2,
  });
  const urlOf = (key: string) => `${env.S3_ENDPOINT!.replace(/\/$/, '')}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const call = async (method: string, key: string, init: RequestInit = {}) => {
    const response = await client.fetch(urlOf(key), { method, signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
    if (!response.ok && response.status !== 404) throw new Error(`Storage ${method} answered ${response.status}`);
    return response;
  };
  return {
    put: (key: string, data: Buffer) =>
      call('PUT', key, {
        body: new Uint8Array(data),
        headers: { 'Content-Type': contentType(key), 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff' },
      }).then(() => undefined),
    remove: (key: string) => call('DELETE', key).then(() => undefined),
    read: async (key: string) => {
      const response = await call('GET', key);
      return response.status === 404 ? undefined : Buffer.from(await response.arrayBuffer());
    },
  };
}

function s3Public(): Storage {
  const bucket = s3Bucket(env.S3_PUBLIC_BUCKET!, 'public, max-age=2592000, immutable');
  return {
    async put(key, data) {
      if (!safeKey(key)) throw new Error('Bad storage key');
      await bucket.put(key, data);
      return PUBLIC_PREFIX + key;
    },
    async remove(ref) {
      const key = ref.startsWith(PUBLIC_PREFIX) ? safeKey(ref.slice(PUBLIC_PREFIX.length)) : undefined;
      if (key) await bucket.remove(key);
    },
  };
}

function s3Private(): PrivateStorage {
  const bucket = s3Bucket(env.S3_PRIVATE_BUCKET!, 'private, no-store');
  const keyOf = (ref: string) => (ref.startsWith(PRIVATE_PREFIX) ? safeKey(ref.slice(PRIVATE_PREFIX.length)) : undefined);
  return {
    async put(key, data) {
      if (!safeKey(key)) throw new Error('Bad storage key');
      await bucket.put(key, data);
      return PRIVATE_PREFIX + key;
    },
    async remove(ref) {
      const key = keyOf(ref);
      if (key) await bucket.remove(key);
    },
    async read(ref) {
      const key = keyOf(ref);
      return key ? bucket.read(key) : undefined;
    },
  };
}

export const storage: Storage = env.STORAGE === 's3' ? s3Public() : localPublic;
export const privateStorage: PrivateStorage = env.STORAGE === 's3' ? s3Private() : localPrivate;
