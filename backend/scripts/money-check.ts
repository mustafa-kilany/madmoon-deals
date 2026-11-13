// npm run money:check: do our own money records add up? (SECURITY_PLAN S3.8)
// Prints the totals and any problem; exit code 1 when there is one.

import { formatJOD } from '@/lib/money';
import { prisma } from '../src/db';
import { findMoneyProblems, moneyTotals } from '../src/modules/orders/moneyCheck';

const [problems, totals] = await Promise.all([findMoneyProblems(), moneyTotals()]);
console.log(`Held for deliveries: ${formatJOD(totals.heldFils, 'en')} in ${totals.heldOrders} orders`);
console.log(`Owed to sellers:     ${formatJOD(totals.owedToSellersFils, 'en')} in ${totals.owedPayouts} payouts`);
for (const p of problems) console.error(`PROBLEM ${p.kind} ${p.orderId}: ${p.detail}`);
console.log(problems.length ? `${problems.length} problems.` : 'All records add up.');
await prisma.$disconnect();
process.exit(problems.length ? 1 : 0);
