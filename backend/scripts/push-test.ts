// Sends a test push to every phone signed in to an account (backend/docs/PUSH.md).
//
//   npm run push:test -- ahmad@example.com
//
// Needs PUSH_MODE=fcm in backend/.env, and the app signed in on the phone (it
// registers itself after sign-in, once notifications are allowed).

import { prisma } from '../src/db';
import { env } from '../src/env';
import { pushSender } from '../src/modules/notifications/push';

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error('Usage: npm run push:test -- <email>');
  const sender = pushSender();
  if (!sender || env.PUSH_MODE !== 'fcm') throw new Error('Set PUSH_MODE=fcm in backend/.env first');
  const devices = await prisma.device.findMany({ where: { user: { email } } });
  if (!devices.length)
    throw new Error(`No phone registered for ${email}: sign in on the phone and allow notifications`);
  for (const device of devices) {
    const ar = device.language === 'ar';
    const result = await sender.send(device.token, {
      title: 'Sahla',
      body: ar ? 'إشعار تجريبي: الإشعارات تعمل ✅' : 'Test notification: pushes work ✅',
      data: { type: 'test', id: '' },
    });
    console.log(`${device.platform} phone (${device.language}): ${result}`);
    if (result === 'gone') await prisma.device.delete({ where: { token: device.token } });
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
