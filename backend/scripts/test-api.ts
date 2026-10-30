// npm run test:api: runs the end-to-end tests (src/**/*.e2e.ts) against a
// separate, empty database "sahla_test", never your development data.

import { execSync } from 'node:child_process';
import 'dotenv/config';

const devUrl = new URL(process.env.DATABASE_URL ?? '');
if (!devUrl.pathname || devUrl.pathname === '/') throw new Error('DATABASE_URL has no database name');
const testUrl = new URL(devUrl);
testUrl.pathname = `${devUrl.pathname.replace(/_test$/, '')}_test`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testUrl.toString(),
  DEV_EMAIL_CODE: '123456',
};
const run = (command: string) => execSync(command, { stdio: 'inherit', env });

run('npx prisma migrate deploy'); // creates sahla_test on first run, then applies migrations
run('npx tsx scripts/empty-db.ts');
// One file at a time: they share the test database.
run('node --import tsx --test --test-concurrency=1 "src/**/*.e2e.ts"');
