// Staff accounts from the terminal, until the admin dashboard (B8) has a page for it.
//
//   npm run staff -- courier "Omar Courier" omar@sahla.jo   creates it and emails the invite code
//   npm run staff -- admin "Mustafa" mustafa@sahla.jo [owner|operations|support|finance]   an admin (default owner)
//   npm run staff -- reset-2fa mustafa@sahla.jo               lost authenticator app: set up again at next log-in
//   npm run staff -- disable omar@sahla.jo                    stops them signing in
//   npm run staff -- list
//
// The courier then opens the app → Log in → "Forgot password", enters their email
// and the emailed code, and chooses a password.

import { prisma } from '../src/db';
import { env } from '../src/env';
import { createAdmin, createCourier, disableCourier, resetAdmin2fa } from '../src/modules/staff/service';
import type { AdminRole } from '../src/generated/prisma/client';

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    case 'courier': {
      const [name, email] = args;
      if (!name || !email) throw new Error(`Usage: courier "<name>" <name>@${env.STAFF_EMAIL_DOMAIN}`);
      const courier = await createCourier({ name, email });
      console.log(`Courier ${courier.name} <${courier.email}> ready.`);
      console.log(
        env.DEV_EMAIL_CODE
          ? `Local testing: set the password in the app with code ${env.DEV_EMAIL_CODE} (no email is sent).`
          : 'The invite code was emailed (printed above until an email service is connected).',
      );
      break;
    }
    case 'admin': {
      const [name, email, type = 'owner'] = args;
      if (!name || !email || !['owner', 'operations', 'support', 'finance'].includes(type))
        throw new Error(`Usage: admin "<name>" <name>@${env.STAFF_EMAIL_DOMAIN} [owner|operations|support|finance]`);
      const admin = await createAdmin({ name, email }, type as AdminRole);
      console.log(`Admin (${type}) ${admin.name} <${admin.email}> ready; set the password with the emailed code.`);
      console.log('Then log in to the dashboard: the first log-in shows a QR code for an authenticator app.');
      break;
    }
    case 'reset-2fa': {
      const [email] = args;
      if (!email) throw new Error('Usage: reset-2fa <email>');
      await resetAdmin2fa(email);
      console.log(`2FA reset for ${email}: the next dashboard log-in shows a new QR code.`);
      break;
    }
    case 'disable': {
      const [email] = args;
      if (!email) throw new Error('Usage: disable <email>');
      await disableCourier(email);
      console.log(`Disabled ${email}; their sessions are ended.`);
      break;
    }
    case 'list': {
      const staff = await prisma.user.findMany({
        where: { role: { not: null } },
        select: { name: true, email: true, role: true, suspended: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      console.table(staff);
      break;
    }
    default:
      throw new Error('Commands: courier, admin, reset-2fa, disable, list');
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
