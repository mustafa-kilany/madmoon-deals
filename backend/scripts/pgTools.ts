// Shared by the backup scripts: finding PostgreSQL's tools, connecting without putting the
// password on a command line (where any process list can read it), and the file format.

import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** PG_BIN, or the installer's folder on Windows, or the PATH. */
export function pgTool(name: string) {
  const candidates = [process.env.PG_BIN, 'C:/Program Files/PostgreSQL/18/bin'].filter(Boolean) as string[];
  for (const dir of candidates) {
    const file = path.join(dir, process.platform === 'win32' ? `${name}.exe` : name);
    if (existsSync(file)) return file;
  }
  return name;
}

export function connection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    database: url.pathname.slice(1),
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      ...(url.searchParams.get('sslmode') && { PGSSLMODE: url.searchParams.get('sslmode')! }),
    },
  };
}

export function run(tool: string, args: string[], env: NodeJS.ProcessEnv) {
  const r = spawnSync(pgTool(tool), args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${tool}: ${r.error.message}. Set PG_BIN to PostgreSQL's bin folder.`);
  if (r.status !== 0) throw new Error(`${tool} failed: ${r.stderr}`);
  return r.stdout;
}

const MAGIC = Buffer.from('SAHLABK1');
const keyFrom = (secret: string) => createHash('sha256').update(secret).digest();

/** AES-256-GCM: a backup holds everyone's data, and it lives somewhere other than the database. */
export function encryptFile(input: string, output: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(readFileSync(input)), cipher.final()]);
  writeFileSync(output, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), data]), { mode: 0o600 });
}

export function decryptFile(input: string, output: string, secret: string) {
  const file = readFileSync(input);
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error(`${input} isn't a Madmoon Deals backup`);
  const iv = file.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = file.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  try {
    writeFileSync(output, Buffer.concat([decipher.update(file.subarray(MAGIC.length + 28)), decipher.final()]), { mode: 0o600 });
  } catch {
    throw new Error('Wrong BACKUP_KEY, or the file was changed');
  }
}

export const backupKey = () => {
  const key = process.env.BACKUP_KEY;
  if (!key || key.length < 32) throw new Error('BACKUP_KEY is required, at least 32 characters (npm run secret). Keep a copy away from the backups.');
  return key;
};
