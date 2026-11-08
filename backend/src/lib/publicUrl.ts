import type { Request } from 'express';
import { env } from '../env';

const FILES = '/files/';

/**
 * Absolute URL of a file. Uploaded files ("/files/…") come from the public bucket's
 * address when there is one (FILES_PUBLIC_URL). Everything else is on this server:
 * PUBLIC_URL in production (https://api.sahla.jo); otherwise the address the caller used,
 * so the Android emulator gets http://10.0.2.2:4000/… and a browser localhost.
 */
export const publicUrl = (req: Request, path: string) =>
  env.FILES_PUBLIC_URL && path.startsWith(FILES)
    ? `${env.FILES_PUBLIC_URL}/${path.slice(FILES.length)}`
    : `${env.PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`}${path}`;

/** The reverse, for a URL the app sends back: what the database stores ("/files/listings/x.jpg"). */
export const storedPath = (url: string) =>
  env.FILES_PUBLIC_URL && url.startsWith(`${env.FILES_PUBLIC_URL}/`)
    ? FILES + url.slice(env.FILES_PUBLIC_URL.length + 1)
    : new URL(url).pathname;
