// For the Maestro flows only: ends an auction now, as time would, and closes it. Refuses any
// database whose name doesn't end in "_test".
//   npx tsx scripts/e2e-end-auction.ts <listing id>
//   npx tsx scripts/e2e-end-auction.ts <listing id> <seconds>     only moves the end to that many seconds from now

import { prisma } from '../src/db';
import { env } from '../src/env';
import { closeEndedAuctions } from '../src/modules/negotiation/bids';

if (!new URL(env.DATABASE_URL).pathname.endsWith('_test')) {
  console.error('Refusing: only *_test databases.');
  process.exit(1);
}
const [id, seconds] = process.argv.slice(2);
if (seconds) {
  await prisma.listing.update({ where: { id }, data: { auctionEndsAt: new Date(Date.now() + Number(seconds) * 1000), auctionOriginalEndsAt: null } });
  console.log(`${id} now ends in ${seconds} seconds`);
  await prisma.$disconnect();
  process.exit(0);
}
await prisma.listing.update({ where: { id }, data: { auctionEndsAt: new Date(Date.now() - 1000) } });
await closeEndedAuctions();
const listing = await prisma.listing.findUniqueOrThrow({ where: { id }, select: { auctionWinnerId: true, priceFils: true } });
console.log(`Ended ${id}: winner ${listing.auctionWinnerId}, ${listing.priceFils} fils`);
await prisma.$disconnect();
process.exit(0);
