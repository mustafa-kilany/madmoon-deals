import { prisma } from '../../db';
import { accountSignals, FLAG_THRESHOLD, type Signal } from './signals';

/**
 * Optional: writes a short explanation of the signals for the admin
 * (docs/ACCOUNT-RISK.md → AI reviewer). It only summarises; it decides nothing.
 */
export interface AiReviewer {
  readonly model: string;
  summarise(input: { signals: Signal[]; account: Record<string, unknown> }): Promise<string>;
}

/**
 * Checks one account and, when its score reaches the threshold and it has no
 * open flag yet, adds it to the admin queue. Returns the flag id, if any.
 * Run it after sign-up, after each listing, report or block, and nightly.
 */
export async function checkAccount(userId: string, reviewer?: AiReviewer) {
  const signals = await accountSignals(userId);
  const score = signals.reduce((sum, s) => sum + s.points, 0);
  if (score < FLAG_THRESHOLD) return undefined;

  const open = await prisma.riskFlag.findFirst({ where: { userId, status: 'open' } });
  if (open) return open.id;

  await prisma.accountSignal.createMany({
    data: signals.map(s => ({ userId, kind: s.kind, points: s.points, details: s.details as object })),
  });

  let aiSummary: string | undefined;
  if (reviewer) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true, method: true, verified: true, cityId: true },
    });
    // Never send names, emails or messages to the AI: the signals are enough.
    aiSummary = await reviewer
      .summarise({ signals, account: user })
      .catch(error => `AI summary failed: ${error instanceof Error ? error.message : error}`);
  }

  const flag = await prisma.riskFlag.create({
    data: {
      userId,
      score,
      signals: signals as object[],
      aiSummary,
      aiModel: aiSummary ? reviewer?.model : undefined,
    },
  });
  return flag.id;
}
