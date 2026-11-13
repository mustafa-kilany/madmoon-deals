// npm run db:restore -- <file> <empty target database url>: a backup into an EMPTY database.
// It refuses a database that has tables, so it can't overwrite anything (docs/BACKUPS.md).

import 'dotenv/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupKey, connection, decryptFile, run } from './pgTools';

const [file, target] = process.argv.slice(2);
if (!file || !target) throw new Error('Usage: npm run db:restore -- <file> <empty target database url>');
const { database, env } = connection(target);
const tables = run('psql', ['--dbname', database, '--tuples-only', '--no-align', '--command', "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"], env).trim();
if (tables !== '0') throw new Error(`${database} has ${tables} tables: restore only into an empty database`);

const dir = mkdtempSync(path.join(tmpdir(), 'sahla-restore-'));
try {
  const dump = path.join(dir, 'dump');
  decryptFile(file, dump, backupKey());
  run('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${database}`, dump], env);
  console.log(`Restored ${file} into ${database}. Now run: npm run money:check with this DATABASE_URL.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
