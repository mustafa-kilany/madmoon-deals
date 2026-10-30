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

