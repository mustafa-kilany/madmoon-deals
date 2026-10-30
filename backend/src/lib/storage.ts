import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Where uploaded files live. Development: the backend/uploads folder, served at
// /files. Production: cloud storage (R2 / S3, BACKEND_PLAN D1) behind the same
// two functions, so nothing else changes.

export interface Storage {
  /** Saves the file and returns its URL ("/files/…" = on this server). */
  put(key: string, data: Buffer): Promise<string>;
  remove(url: string): Promise<void>;
}

export const uploadDir = fileURLToPath(new URL('../../uploads', import.meta.url));

const PUBLIC_PREFIX = '/files/';

export const localStorage: Storage = {
  async put(key, data) {
    const file = path.join(uploadDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return PUBLIC_PREFIX + key;
  },
  async remove(url) {
    if (!url.startsWith(PUBLIC_PREFIX)) return;
    const file = path.join(uploadDir, url.slice(PUBLIC_PREFIX.length));
    if (!file.startsWith(uploadDir)) return; // never outside the folder
    await rm(file, { force: true });
  },
};

export const storage: Storage = localStorage;

// Private files: test certificate originals (IMEI / serial numbers visible). A
// separate folder that is never served; admins see them through the dashboard
// (B8). Production: a private bucket. Refs look like "private:certificates/….jpg".
export const privateDir = fileURLToPath(new URL('../../uploads-private', import.meta.url));
const PRIVATE_PREFIX = 'private:';

export const privateStorage: Storage = {
  async put(key, data) {
    const file = path.join(privateDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return PRIVATE_PREFIX + key;
  },
  async remove(ref) {
    if (!ref.startsWith(PRIVATE_PREFIX)) return;
    const file = path.join(privateDir, ref.slice(PRIVATE_PREFIX.length));
    if (!file.startsWith(privateDir)) return;
    await rm(file, { force: true });
  },
};
