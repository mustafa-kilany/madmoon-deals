// The suspicious-account checker's rules (docs/ACCOUNT-RISK.md). Each rule
// looks at one account and may add points. It never acts on its own: enough
// points only put the account in the admin queue (RiskFlag).

import { prisma } from '../../db';
import { DISPOSABLE_DOMAINS } from './disposableDomains';

export type Signal = { kind: string; points: number; details: Record<string, unknown> };

/** An account at or above this score goes to the admin queue. */
export const FLAG_THRESHOLD = 40;

const DAY = 86_400_000;

export function emailSignals(email: string | null): Signal[] {
  if (!email) return [];
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const local = email.split('@')[0] ?? '';
  const signals: Signal[] = [];
  if (DISPOSABLE_DOMAINS.has(domain))
    signals.push({ kind: 'disposable_email', points: 30, details: { domain } });
  // e.g. "k8x2q9z7w1@gmail.com": machine-made addresses.
  if (/^[a-z0-9]{10,}$/i.test(local) && (local.match(/\d/g)?.length ?? 0) >= 5)
    signals.push({ kind: 'random_email', points: 10, details: { local } });
  return signals;
}

export async function accountSignals(userId: string, now = new Date()): Promise<Signal[]> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { sessions: { select: { deviceId: true } } },
  });
  const signals = emailSignals(user.email);
  const since30 = new Date(now.getTime() - 30 * DAY);

  // Many accounts signed in on the same phone.
  const deviceIds = [...new Set(user.sessions.map(s => s.deviceId).filter(Boolean))] as string[];
  if (deviceIds.length > 0) {
    const others = await prisma.session.findMany({
      where: { deviceId: { in: deviceIds }, userId: { not: userId } },
      distinct: ['userId'],
      select: { userId: true },
    });
    if (others.length >= 2)
      signals.push({
        kind: 'shared_device',
        points: Math.min(15 * others.length, 45),
        details: { otherAccounts: others.map(o => o.userId) },
      });
  }

  // Many listings in a short time.
  const lastDay = await prisma.listing.count({
    where: { sellerUserId: userId, createdAt: { gte: new Date(now.getTime() - DAY) } },
  });
  if (lastDay >= 15) signals.push({ kind: 'listing_burst', points: 20, details: { lastDay } });

  // A brand-new account selling something expensive.
  if (now.getTime() - user.createdAt.getTime() < 2 * DAY) {
    const expensive = await prisma.listing.count({
      where: { sellerUserId: userId, priceFils: { gte: 1_000_000 } }, // 1000 JOD
    });
    if (expensive > 0)
      signals.push({ kind: 'new_account_expensive', points: 10, details: { expensive } });
  }

  // Different people reporting the account or its listings.
  const listingIds = (
    await prisma.listing.findMany({ where: { sellerUserId: userId }, select: { id: true } })
  ).map(l => l.id);
  const reporters = await prisma.report.findMany({
    where: {
      createdAt: { gte: since30 },
      OR: [
        { targetType: 'user', targetId: userId },
        { targetType: 'listing', targetId: { in: listingIds } },
      ],
    },
    distinct: ['reporterId'],
    select: { reporterId: true, reason: true },
  });
  if (reporters.length >= 2)
    signals.push({
      kind: 'reports_received',
      points: Math.min(10 * reporters.length, 40),
      details: { reporters: reporters.length, reasons: reporters.map(r => r.reason) },
    });

  const blockers = await prisma.block.count({
    where: { blockedId: userId, createdAt: { gte: since30 } },
  });
  if (blockers >= 3) signals.push({ kind: 'blocks_received', points: 15, details: { blockers } });

  return signals;
}
