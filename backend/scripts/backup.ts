// npm run db:backup -- [file]: an encrypted copy of the database (docs/BACKUPS.md).

import 'dotenv/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupKey, connection, encryptFile, run } from './pgTools';

const key = backupKey();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = process.argv[2] ?? `madmoon-${stamp}.backup`;

const { database, env } = connection(url);
const dir = mkdtempSync(path.join(tmpdir(), 'madmoon-backup-'));
try {
  const dump = path.join(dir, 'dump');
  run('pg_dump', ['--format=custom', `--file=${dump}`, '--no-owner', '--no-privileges', database], env);
  encryptFile(dump, output, key);
  console.log(`Backed up ${database} to ${output}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
