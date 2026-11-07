// npm run test:api: runs the end-to-end tests (src/**/*.e2e.ts) against a
// separate, empty database "sahla_test", never your development data.
// npm run test:api -- orders: only the files whose name starts with "orders".

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
  SANAD_MODE: 'fake',
  PAYMENT_MODE: 'fake',
  GEOCODER: 'fake',
  PUSH_MODE: 'fake',
  MAIL_MODE: 'console', // never real emails from the tests
  ADMIN_2FA: 'on', // the tests turn it off themselves where needed, whatever .env says
  // The flows pay and upload more than a person would; limits.e2e.ts checks the real budgets.
  RATE_LIMIT_MULTIPLIER: '50',
};
const run = (command: string) => execSync(command, { stdio: 'inherit', env });

run('npx prisma migrate deploy'); // creates sahla_test on first run, then applies migrations
run('npx tsx scripts/empty-db.ts');
// One file at a time: they share the test database.
const only = process.argv[2]?.replace(/[^\w-]/g, '') ?? '';
run(`node --import tsx --test --test-concurrency=1 "src/**/${only}*.e2e.ts"`);
