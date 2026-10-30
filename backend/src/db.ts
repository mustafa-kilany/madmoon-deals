import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env';
import { PrismaClient } from './generated/prisma/client';

// One shared database client for the whole server.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
