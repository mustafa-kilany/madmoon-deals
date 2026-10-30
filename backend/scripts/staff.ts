// Staff accounts from the terminal, until the admin dashboard (B8) has a page for it.
//
//   npm run staff -- courier "Omar Courier" omar@sahla.jo   creates it and emails the invite code
//   npm run staff -- admin "Mustafa" mustafa@sahla.jo          an admin (dashboard, category pictures)
//   npm run staff -- disable omar@sahla.jo                    stops them signing in
//   npm run staff -- list
//
// The courier then opens the app → Log in → "Forgot password", enters their email
// and the emailed code, and chooses a password.

import { prisma } from '../src/db';
import { env } from '../src/env';
import { createAdmin, createCourier, disableCourier } from '../src/modules/staff/service';

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
      const [name, email] = args;
      if (!name || !email) throw new Error(`Usage: admin "<name>" <name>@${env.STAFF_EMAIL_DOMAIN}`);
      const admin = await createAdmin({ name, email });
      console.log(`Admin ${admin.name} <${admin.email}> ready; set the password with the emailed code.`);
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
      throw new Error('Commands: courier, admin, disable, list');
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
