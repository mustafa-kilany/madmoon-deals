// Development data: the demo accounts of the contract server (the app's tests
// and Maestro flows sign in with them) and the app's mock catalog
// (scripts/seed-listings.ts). Safe to run again.
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
  { name: 'Ahmad', email: 'ahmad@sahla.jo', cardBrand: 'visa', cardLast4: '4242', cardToken: 'fakecard_visa_4242' },
  { name: 'Sahla Courier', email: 'courier@sahla.jo', verified: true, role: 'courier' as const },
  // The dashboard (admin/): the first log-in shows a QR code for an authenticator app.
  { name: 'Sahla Admin', email: 'admin@sahla.jo', verified: true, role: 'admin' as const, adminRole: 'owner' as const },
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
  // Loaded only now, after the production check (it builds the mock catalog on import).
  const { seedListings } = await import('./seed-listings');
  await seedListings();
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
