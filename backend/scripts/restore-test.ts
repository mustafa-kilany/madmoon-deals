// npm run db:restore-test: the drill (SECURITY_PLAN S7.7): a backup nobody restored isn't a
// backup. Copies DATABASE_URL into an encrypted file, restores it into a NEW throwaway
// database, compares every table's rows, checks a wrong key is refused, runs the money
// check on the copy, then drops the copy. Only reads the real database.

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connection, decryptFile, encryptFile, run } from './pgTools';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const key = process.env.BACKUP_KEY ?? randomBytes(32).toString('base64url');
const source = connection(url);
const copyName = `${source.database}_restore_drill`;
const copyUrl = new URL(url);
copyUrl.pathname = `/${copyName}`;
const admin = ['--dbname', 'postgres', '--command'];

const counts = (database: string, env: NodeJS.ProcessEnv) => {
  const tables = run('psql', ['--dbname', database, '--tuples-only', '--no-align', '--command', "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"], env)
    .split(/\r?\n/)
    .filter(Boolean);
  const result: Record<string, number> = {};
  for (const table of tables)
    result[table] = Number(run('psql', ['--dbname', database, '--tuples-only', '--no-align', '--command', `SELECT count(*) FROM "${table}"`], env).trim());
  return result;
};

const dir = mkdtempSync(path.join(tmpdir(), 'sahla-drill-'));
let failed = false;
try {
  const started = Date.now();
  const dump = path.join(dir, 'dump');
  const backup = path.join(dir, 'sahla.backup');
  run('pg_dump', ['--format=custom', `--file=${dump}`, '--no-owner', '--no-privileges', source.database], source.env);
  encryptFile(dump, backup, key);
  console.log(`Backup: ${(statSync(backup).size / 1024).toFixed(0)} KB, encrypted`);
  if (readFileSync(backup).includes('postgresql') || readFileSync(backup).includes('@example.com')) throw new Error('The backup file has readable text in it');

  let wrongKeyRefused = false;
  try {
    decryptFile(backup, path.join(dir, 'x'), 'not-the-right-key-not-the-right-key');
  } catch {
    wrongKeyRefused = true;
  }
  if (!wrongKeyRefused) throw new Error('A wrong key was accepted');
  console.log('A wrong key is refused');

  run('psql', [...admin, `DROP DATABASE IF EXISTS "${copyName}"`], source.env);
  run('psql', [...admin, `CREATE DATABASE "${copyName}"`], source.env);
  const restored = path.join(dir, 'restored');
  decryptFile(backup, restored, key);
  run('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${copyName}`, restored], source.env);

  const [before, after] = [counts(source.database, source.env), counts(copyName, source.env)];
  const tables = Object.keys(before);
  const different = tables.filter(table => before[table] !== after[table]);
  if (different.length) throw new Error(`Different row counts: ${different.join(', ')}`);
  const total = tables.reduce((sum, table) => sum + before[table], 0);
  console.log(`Restored ${tables.length} tables, ${total} rows: every table matches`);

  const check = spawnSync('npx', ['tsx', 'scripts/money-check.ts'], {
    env: { ...process.env, DATABASE_URL: copyUrl.toString() },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  console.log(check.stdout.trim());
  if (check.stderr.trim()) console.log(check.stderr.trim());
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  rmSync(dir, { recursive: true, force: true });
  try {
    run('psql', [...admin, `DROP DATABASE IF EXISTS "${copyName}"`], source.env);
  } catch {
    console.error(`Couldn't drop ${copyName}: drop it by hand.`);
  }
}
process.exit(failed ? 1 : 0);
