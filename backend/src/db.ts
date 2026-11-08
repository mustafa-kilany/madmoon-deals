import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env';
import { PrismaClient } from './generated/prisma/client';

// One shared database client for the whole server.
export const prisma = new PrismaClient({
  // A managed database allows a set number of connections: keep this below it (DB_POOL_SIZE).
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DB_POOL_SIZE }),
});
