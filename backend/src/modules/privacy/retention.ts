import { prisma } from '../../db';
import { daily } from '../../lib/jobs';
import { logger } from '../../lib/logger';
import { privateStorage, storage } from '../../lib/storage';

// SECURITY_PLAN S8.3: how long personal data stays, the numbers the privacy policy
// promises ("How long we keep it", frontend/src/legal). A lawyer reviews them before
// launch: change them here and in the policy together. Runs nightly; each step works in
// small batches and is safe to run again.

const DAY = 86_400_000;
export const KEEP_DAYS = {
  /** Phones, addresses and notes on an order, after it ended (the names and amounts stay). */
  orderContact: 90,
  /** A checkout nobody paid: it holds an address for nothing. */
  unpaidCheckout: 30,
  /** A test certificate's original (IMEI, serial), once its listing is sold or withdrawn. */
  certificateOriginal: 180,
  /** A certificate no listing used (failed, or the form was abandoned). */
  unusedCertificate: 30,
  /** A withdrawn listing's photos. */
  withdrawnPhotos: 180,
  /** A chat after its last message, once the item is sold or withdrawn. */
  chat: 365,
  /** The support chat after its last message. */
  support: 730,
  /** Reports an admin closed. */
  resolvedReport: 730,
  /** Risk signals and listing views: only useful while recent. */
  accountSignal: 365,
  listingView: 90,
  /** Sign-ins after they expired (their IP and device id) and emailed codes. */
  expiredSession: 7,
  emailCode: 1,
} as const;

const BATCH = 500;

/** One run. `now` is for the tests. Returns what it did, for the log. */
export async function runRetention(now = Date.now()) {
  const ago = (days: number) => new Date(now - days * DAY);
  const done: Record<string, number> = {};

  const ended = ago(KEEP_DAYS.orderContact);
  done.orderContacts = (
    await prisma.order.updateMany({
      where: {
        status: { in: ['completed', 'refunded', 'cancelled'] },
        deliveryPhone: { not: '' },
        OR: [{ deliveredAt: { lt: ended } }, { refundedAt: { lt: ended } }, { cancelledAt: { lt: ended } }],
      },
      data: {
        deliveryPhone: '',
        deliveryAddress: '',
        deliveryNotes: null,
        pickupPhone: null,
        pickupAddress: null,
        pickupNotes: null,
        cancelNote: null,
        itemIssueNote: null,
        failedNote: null,
      },
    })
  ).count;

  done.unpaidCheckouts = (
    await prisma.order.deleteMany({
      where: {
        status: 'awaiting_payment',
        updatedAt: { lt: ago(KEEP_DAYS.unpaidCheckout) },
        payments: { none: {} }, // any payment, even refunded or failed, is a money record (H3)
      },
    })
  ).count;

  // Originals: the file goes first, then the row forgets it and the text read off it.
  const finishedListing = { status: { in: ['sold', 'withdrawn'] as ('sold' | 'withdrawn')[] }, updatedAt: { lt: ago(KEEP_DAYS.certificateOriginal) } };
  const certificates = await prisma.testCertificate.findMany({
    where: {
      photoUrl: { not: '' },
      OR: [{ listing: finishedListing }, { listing: null, createdAt: { lt: ago(KEEP_DAYS.unusedCertificate) } }],
    },
    select: { id: true, photoUrl: true, blurredUrl: true, listing: { select: { id: true } } },
    take: BATCH,
  });
  for (const certificate of certificates) {
    await privateStorage.remove(certificate.photoUrl);
    // A sold listing still shows the blurred copy; an unused certificate has no use for one.
    if (!certificate.listing && certificate.blurredUrl) await storage.remove(certificate.blurredUrl);
    await prisma.testCertificate.update({
      where: { id: certificate.id },
      data: { photoUrl: '', ocrText: '', shopPhone: null, ...(!certificate.listing && { blurredUrl: null }) },
    });
  }
  done.certificates = certificates.length;

  const withdrawn = await prisma.listing.findMany({
    where: { status: 'withdrawn', sellerUserId: { not: null }, updatedAt: { lt: ago(KEEP_DAYS.withdrawnPhotos) }, NOT: { imageUrls: { isEmpty: true } } },
    select: { id: true, imageUrls: true },
    take: BATCH,
  });
  for (const listing of withdrawn) {
    const uploads = await prisma.upload.findMany({ where: { url: { in: listing.imageUrls } }, select: { id: true, url: true, thumbUrl: true } });
    for (const url of new Set([...listing.imageUrls, ...uploads.flatMap(u => (u.thumbUrl ? [u.thumbUrl] : []))])) await storage.remove(url);
    await prisma.upload.deleteMany({ where: { id: { in: uploads.map(u => u.id) } } });
    await prisma.listing.update({ where: { id: listing.id }, data: { imageUrls: [], pickupPhone: null, pickupAddress: null, pickupNotes: null } });
  }
  done.withdrawnListings = withdrawn.length;

  done.chats = (await prisma.chat.deleteMany({ where: { updatedAt: { lt: ago(KEEP_DAYS.chat) }, listing: { status: { in: ['sold', 'withdrawn'] } } } })).count;
  done.supportThreads = (await prisma.supportThread.deleteMany({ where: { lastMessageAt: { lt: ago(KEEP_DAYS.support) } } })).count;
  done.reports = (await prisma.report.deleteMany({ where: { resolvedAt: { lt: ago(KEEP_DAYS.resolvedReport) } } })).count;
  done.signals = (await prisma.accountSignal.deleteMany({ where: { createdAt: { lt: ago(KEEP_DAYS.accountSignal) } } })).count;
  done.views = (await prisma.listingView.deleteMany({ where: { day: { lt: ago(KEEP_DAYS.listingView) } } })).count;
  done.sessions = (await prisma.session.deleteMany({ where: { expiresAt: { lt: ago(KEEP_DAYS.expiredSession) } } })).count;
  done.emailCodes = (await prisma.emailCode.deleteMany({ where: { expiresAt: { lt: ago(KEEP_DAYS.emailCode) } } })).count;
  return done;
}

/** Every night at 04:00 Jordan time. */
export function scheduleRetention() {
  daily('retention', 4, async () => logger.info({ removed: await runRetention() }, 'Retention clean-up'));
}
