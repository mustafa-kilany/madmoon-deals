// Empties every table of the TEST database before the end-to-end tests.
// Refuses any database whose name doesn't end in "_test".

import { prisma } from '../src/db';
import { env } from '../src/env';

const name = new URL(env.DATABASE_URL).pathname.slice(1);
if (!name.endsWith('_test')) {
  console.error(`Refusing to empty "${name}": only *_test databases.`);
  process.exit(1);
}

const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
if (tables.length > 0)
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} CASCADE`,
  );
await prisma.$disconnect();
console.log(`Emptied ${tables.length} tables in ${name}`);
