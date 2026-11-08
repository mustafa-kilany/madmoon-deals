import { prisma } from '../../db';
import { daily } from '../../lib/jobs';
import { logger } from '../../lib/logger';

// SECURITY_PLAN S3.8: our own money records must add up. Every paid order has exactly
// one succeeded payment of its total, a delivered one exactly one payout of the item's
// price, a refunded one none, and so on. Run daily and with `npm run money:check`.
// Comparing these with the payment provider's settlement report comes with D2 (B7.9).

export type MoneyProblem = { kind: string; orderId: string; detail: string };

const CHECKS = [
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'wrong_total' AS kind, o."id" AS "orderId",
           'total ' || o."totalFils" || ' <> ' || (o."itemPriceFils" + o."buyerProtectionFils" + o."deliveryFils") AS detail
    FROM "Order" o WHERE o."totalFils" <> o."itemPriceFils" + o."buyerProtectionFils" + o."deliveryFils"`,
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'paid_payment_count' AS kind, o."id" AS "orderId", COUNT(p."id")::text || ' succeeded payments' AS detail
    FROM "Order" o LEFT JOIN "Payment" p ON p."orderId" = o."id" AND p."status" = 'succeeded'
    WHERE o."status"::text IN ('escrow_held', 'completed')
    GROUP BY o."id" HAVING COUNT(p."id") <> 1`,
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'money_kept' AS kind, o."id" AS "orderId", 'a succeeded payment on a ' || o."status"::text || ' order' AS detail
    FROM "Order" o JOIN "Payment" p ON p."orderId" = o."id" AND p."status" = 'succeeded'
    WHERE o."status"::text IN ('awaiting_payment', 'refunded', 'cancelled')`,
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'payment_amount' AS kind, o."id" AS "orderId", 'paid ' || p."amountFils" || ', total ' || o."totalFils" AS detail
    FROM "Order" o JOIN "Payment" p ON p."orderId" = o."id" AND p."status" = 'succeeded'
    WHERE p."amountFils" <> o."totalFils"`,
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'delivered_no_payout' AS kind, o."id" AS "orderId", 'completed without a payout' AS detail
    FROM "Order" o LEFT JOIN "Payout" po ON po."orderId" = o."id"
    WHERE o."status" = 'completed' AND po."id" IS NULL`,
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'payout_amount' AS kind, o."id" AS "orderId", 'payout ' || po."amountFils" || ', item ' || o."itemPriceFils" AS detail
    FROM "Order" o JOIN "Payout" po ON po."orderId" = o."id"
    WHERE po."amountFils" <> o."itemPriceFils"`,
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'payout_not_delivered' AS kind, o."id" AS "orderId", 'a payout on a ' || o."status"::text || ' order' AS detail
    FROM "Order" o JOIN "Payout" po ON po."orderId" = o."id"
    WHERE o."status" <> 'completed'`,
  () => prisma.$queryRaw<MoneyProblem[]>`
    SELECT 'listing_status' AS kind, o."id" AS "orderId", 'order ' || o."status"::text || ', listing ' || l."status"::text AS detail
    FROM "Order" o JOIN "Listing" l ON l."id" = o."listingId"
    WHERE (o."status" = 'escrow_held' AND l."status" <> 'reserved')
       OR (o."status" = 'completed' AND l."status" <> 'sold')`,
];

export async function findMoneyProblems() {
  return (await Promise.all(CHECKS.map(check => check()))).flat();
}

/** The two numbers a person looks at: money held for deliveries, and owed to sellers. */
export async function moneyTotals() {
  const [held, owed] = await Promise.all([
    prisma.order.aggregate({ where: { status: 'escrow_held' }, _sum: { totalFils: true }, _count: true }),
    prisma.payout.aggregate({ where: { status: 'pending' }, _sum: { amountFils: true }, _count: true }),
  ]);
  return {
    heldFils: held._sum.totalFils ?? 0,
    heldOrders: held._count,
    owedToSellersFils: owed._sum.amountFils ?? 0,
    owedPayouts: owed._count,
  };
}

/** Every morning at 06:00 Jordan time; a problem is logged as an error (and reaches the error reporter). */
export function scheduleMoneyCheck() {
  daily('money-check', 6, async () => {
    const problems = await findMoneyProblems();
    if (problems.length) logger.error({ problems: problems.slice(0, 50), count: problems.length }, 'Money check: records don’t add up');
    else logger.info('Money check: all records add up');
  });
}
