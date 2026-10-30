import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { keyedHash } from '../../lib/hash';
import { idProvider } from './provider';

// A check is started by the app and finished when Sanad sends the user back to
// our callback. Unanswered checks expire; one national ID verifies one account.

const STATE_TTL_MS = 15 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const nationalIdHash = (nationalId: string) => keyedHash('national-id', nationalId);

/** POST /me/id-verification/sanad: where to send the user to approve in Sanad. */
export async function startSanad(userId: string, callbackUrl: string) {
  const provider = idProvider();
  if (!provider) throw new ApiError(503, 'SANAD_UNAVAILABLE', 'ID verification with Sanad is coming soon');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.verified) throw new ApiError(422, 'VALIDATION', 'This account is already verified');

  const state = randomBytes(32).toString('base64url');
  await prisma.$transaction([
    // An earlier check the user never finished is replaced.
    prisma.idVerification.deleteMany({ where: { userId, status: 'pending' } }),
    prisma.idVerification.create({ data: { userId, stateHash: sha256(state) } }),
  ]);
  return provider.authorizeUrl(state, callbackUrl);
}

export type SanadOutcome = 'verified' | 'cancelled' | 'expired' | 'id_used' | 'failed';

/** GET /id-verification/sanad/callback: Sanad's answer for one check. */
export async function finishSanad(
  answer: { state?: string; code?: string; error?: string },
  callbackUrl: string,
): Promise<SanadOutcome> {
  const provider = idProvider();
  if (!provider || !answer.state) return 'expired';
  const check = await prisma.idVerification.findUnique({ where: { stateHash: sha256(answer.state) } });
  if (!check || check.status !== 'pending' || Date.now() - check.createdAt.getTime() > STATE_TTL_MS)
    return 'expired';

  const reject = async (reason: Exclude<SanadOutcome, 'verified' | 'expired'>) => {
    await prisma.idVerification.update({
      where: { id: check.id },
      data: { status: 'rejected', rejectReason: reason, stateHash: null, decidedAt: new Date() },
    });
    return reason;
  };
  if (answer.error || !answer.code) return reject('cancelled');

  let identity;
  try {
    identity = await provider.exchange(answer.code, callbackUrl);
  } catch (error) {
    console.error('Sanad exchange failed', error);
    return reject('failed');
  }
  const idHash = nationalIdHash(identity.nationalId);
  const usedElsewhere = await prisma.idVerification.findFirst({
    where: { nationalIdHash: idHash, status: 'approved', userId: { not: check.userId } },
  });
  if (usedElsewhere) return reject('id_used');

  await prisma.$transaction([
    prisma.idVerification.update({
      where: { id: check.id },
      data: {
        status: 'approved',
        providerRef: identity.providerRef,
        nationalIdHash: idHash,
        stateHash: null,
        decidedAt: new Date(),
      },
    }),
    prisma.user.update({ where: { id: check.userId }, data: { verified: true } }),
    // Their listings carry the badge too (and rank first).
    prisma.listing.updateMany({ where: { sellerUserId: check.userId }, data: { sellerVerified: true } }),
  ]);
  return 'verified';
}
