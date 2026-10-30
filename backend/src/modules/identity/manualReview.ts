import { randomUUID } from 'node:crypto';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { privateStorage } from '../../lib/storage';
import { fullSize } from '../uploads/images';

// ID verification until Sanad (BACKEND_PLAN B3.5, B11): the user photographs their
// Jordanian ID, an admin compares it with the profile and approves or rejects it.
// The photo is private (never served) and deleted as soon as it's decided.

/** POST /me/id-verification: the photo is saved for review; the account is "pending". */
export async function submitIdPhoto(userId: string, photo: Buffer) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.verified) return user; // nothing to do
  const image = await fullSize(photo, 2000); // readable, upright, no EXIF
  const ref = await privateStorage.put(`id/${userId}/${randomUUID()}.jpg`, image);

  const replaced = await prisma.idVerification.findMany({
    where: { userId, status: 'pending' },
    select: { id: true, photoUrl: true },
  });
  const updated = await prisma.$transaction(async tx => {
    // A new photo replaces a pending one (e.g. the first was blurry).
    await tx.idVerification.deleteMany({ where: { id: { in: replaced.map(r => r.id) } } });
    await tx.idVerification.create({ data: { userId, provider: 'manual', photoUrl: ref } });
    return tx.user.update({ where: { id: userId }, data: { idVerification: 'pending' } });
  });
  for (const old of replaced) if (old.photoUrl) await privateStorage.remove(old.photoUrl);
  return updated;
}

/**
 * An admin's decision on a pending ID (dashboard B8.3; `npm run staff -- id` until then).
 * Approve → Verified badge (also on the user's listings). Reject → they can try again.
 */
export async function decideIdVerification(
  email: string,
  decision: 'approve' | 'reject',
  adminId: string | null,
  reason?: string,
) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const pending =
    user &&
    (await prisma.idVerification.findFirst({
      where: { userId: user.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    }));
  if (!user || !pending) throw new ApiError(404, 'NOT_FOUND', `No pending ID check for ${email}`);

  const approved = decision === 'approve';
  await prisma.$transaction([
    prisma.idVerification.update({
      where: { id: pending.id },
      data: {
        status: approved ? 'approved' : 'rejected',
        rejectReason: approved ? null : (reason ?? 'The photo did not match the account'),
        reviewedById: adminId,
        decidedAt: new Date(),
        photoUrl: null, // deleted below: keep nothing we don't need
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: approved ? { verified: true, idVerification: null } : { idVerification: 'rejected' },
    }),
    ...(approved
      ? [prisma.listing.updateMany({ where: { sellerUserId: user.id }, data: { sellerVerified: true } })]
      : []),
  ]);
  if (pending.photoUrl) await privateStorage.remove(pending.photoUrl);
}
