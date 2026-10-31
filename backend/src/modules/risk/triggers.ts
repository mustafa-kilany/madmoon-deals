import { prisma } from '../../db';
import { daily, runSoon } from '../../lib/jobs';
import { checkAccount } from './checker';

// When the suspicious-account checker runs (BACKEND_PLAN B5.3, docs/ACCOUNT-RISK.md):
// after sign-up and log-in (shared phones), each new listing, a report or a block
// against the account, and nightly. It only ever adds flags to the admin queue.

/** Checks the account shortly after the request (several events at once → one check). */
export function queueRiskCheck(userId: string | null | undefined) {
  if (userId) runSoon(`risk:${userId}`, () => checkAccount(userId));
}

const DAY = 86_400_000;

/** Nightly: every account that signed in, sold, or was reported or blocked in the last 2 days. */
export async function checkRecentAccounts(now = new Date()) {
  const since = new Date(now.getTime() - 2 * DAY);
  const [sessions, listings, reported, blocked] = await Promise.all([
    prisma.session.findMany({ where: { createdAt: { gte: since } }, distinct: ['userId'], select: { userId: true } }),
    prisma.listing.findMany({ where: { createdAt: { gte: since }, sellerUserId: { not: null } }, distinct: ['sellerUserId'], select: { sellerUserId: true } }),
    prisma.report.findMany({ where: { createdAt: { gte: since } }, select: { targetType: true, targetId: true } }),
    prisma.block.findMany({ where: { createdAt: { gte: since } }, distinct: ['blockedId'], select: { blockedId: true } }),
  ]);
  const reportedListings = reported.filter(r => r.targetType === 'listing').map(r => r.targetId);
  const sellers = await prisma.listing.findMany({
    where: { id: { in: reportedListings }, sellerUserId: { not: null } },
    select: { sellerUserId: true },
  });
  const ids = new Set([
    ...sessions.map(s => s.userId),
    ...listings.map(l => l.sellerUserId!),
    ...reported.filter(r => r.targetType === 'user').map(r => r.targetId),
    ...sellers.map(s => s.sellerUserId!),
    ...blocked.map(b => b.blockedId),
  ]);
  let flagged = 0;
  for (const id of ids) {
    // A reported id may not be an account (any more).
    if (!(await prisma.user.count({ where: { id } }))) continue;
    if (await checkAccount(id)) flagged++;
  }
  return { checked: ids.size, flagged };
}

export function scheduleNightlyRiskCheck() {
  daily('nightly risk check', 3, async () => console.log('Nightly risk check:', await checkRecentAccounts()));
}
