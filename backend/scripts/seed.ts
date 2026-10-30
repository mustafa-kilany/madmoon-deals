// Demo accounts for local development, the same as the contract server's
// (the app's tests and Maestro flows sign in with them). Safe to run twice.
//
//   npm run db:seed

import { prisma } from '../src/db';
import { env } from '../src/env';
import { hashPassword } from '../src/modules/auth/password';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to add demo accounts in production.');
  process.exit(1);
}

const demo = [
  { name: 'Ahmad', email: 'ahmad@sahla.jo', cardBrand: 'visa', cardLast4: '4242' },
  { name: 'Sahla Courier', email: 'courier@sahla.jo', verified: true, role: 'courier' as const },
];

async function main() {
  const passwordHash = await hashPassword('sahla1234');
  for (const account of demo) {
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: { ...account, passwordHash, method: 'email' },
    });
    console.log(`${account.email} / sahla1234`);
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
