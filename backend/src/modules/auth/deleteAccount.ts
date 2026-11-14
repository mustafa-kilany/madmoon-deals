import { prisma } from '../../db';
import type { User } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { privateStorage, storage } from '../../lib/storage';
import { paymentProvider } from '../payments/provider';
import { UNPAID_WIN_MS } from '../selling/service';

// DELETE /me (SECURITY_PLAN S1.9, the privacy policy's "How long we keep it"): the
// account, its files and its personal data go. What stays is what accounting needs: the
// amounts of finished orders and payments, with no name, phone or address on them.
// (The admin audit log stays too: it records who at Madmoon Deals did what.)

const closedBecause = (message: string) => new ApiError(409, 'OPEN_ORDERS', message);

/** Why the account can't go yet: someone's money or a live sale depends on it. */
async function refuseWhileOpen(userId: string) {
  const now = Date.now();
  const orders = await prisma.order.count({
    where: {
      OR: [
        { status: 'escrow_held', OR: [{ buyerId: userId }, { sellerUserId: userId }] },
        // A bank card check started in the last hour could still pay, on either side.
        {
          status: 'awaiting_payment',
          OR: [{ buyerId: userId }, { sellerUserId: userId }],
          payments: { some: { status: 'pending', createdAt: { gt: new Date(now - 3_600_000) } } },
        },
      ],
    },
  });
  if (orders) throw closedBecause('Orders in progress: finish them first');
  if (await prisma.payout.count({ where: { sellerUserId: userId, status: { not: 'paid' } } }))
    throw closedBecause('Madmoon Deals still owes you money: wait for your payout');
  const windowOpen = new Date(now - UNPAID_WIN_MS);
  const auctions = await prisma.listing.count({
    where: {
      status: 'active',
      OR: [
        { bids: { some: { bidderId: userId } }, auctionClosedAt: null },
        { auctionWinnerId: userId, auctionClosedAt: { gt: windowOpen } },
        { sellerUserId: userId, saleType: 'auction', bidCount: { gt: 0 }, OR: [{ auctionClosedAt: null }, { auctionClosedAt: { gt: windowOpen } }] },
      ],
    },
  });
  if (auctions) throw closedBecause('You are part of a live auction: wait until it ends');
}

export async function deleteAccount(user: User) {
  // Staff accounts are closed by an admin (a driver with deliveries, the only owner…).
  if (user.role) throw new ApiError(403, 'FORBIDDEN', 'Staff accounts are closed by an admin');
  await refuseWhileOpen(user.id);

  const userId = user.id;
  const [uploads, certificates, listings] = await Promise.all([
    prisma.upload.findMany({ where: { userId }, select: { url: true, thumbUrl: true } }),
    prisma.testCertificate.findMany({ where: { userId }, select: { photoUrl: true, blurredUrl: true } }),
    prisma.listing.findMany({ where: { sellerUserId: userId }, select: { id: true, imageUrls: true } }),
  ]);
  const listingIds = listings.map(l => l.id);

  await prisma.$transaction(async tx => {
    // Conversations about their listings go whole; the ones where they were the buyer
    // go with the account. Reports about them or their listings have no one left to act on.
    await tx.chat.deleteMany({ where: { listingId: { in: listingIds } } });
    await tx.report.deleteMany({
      where: { OR: [{ targetType: 'user', targetId: userId }, { targetType: 'listing', targetId: { in: listingIds } }] },
    });
    await tx.listingView.deleteMany({ where: { viewerKey: userId } });
    // Background jobs about them (a push, a risk check, an email): nobody is left to tell, and they hold the id.
    await tx.$executeRaw`DELETE FROM "Job" WHERE "args"::text LIKE ${`%"${userId}"%`} OR "key" LIKE ${`%${userId}%`}`;
    if (user.email) await tx.$executeRaw`DELETE FROM "Job" WHERE "args"::text LIKE ${`%"${user.email}"%`} OR "key" LIKE ${`%${user.email}%`}`;
    if (user.email) await tx.emailCode.deleteMany({ where: { email: user.email } });

    // Unpaid checkouts, on either side, are nobody's record, unless money moved for them (a late
    // payment, refunded): those stay like finished orders (H3).
    await tx.order.deleteMany({ where: { status: 'awaiting_payment', OR: [{ buyerId: userId }, { sellerUserId: userId }], payments: { none: {} } } });
    // Finished orders stay for the accounts, without who or where. The other side keeps the item and the amounts.
    await tx.order.updateMany({
      where: { buyerId: userId },
      data: { deliveryName: '', deliveryPhone: '', deliveryAddress: '', deliveryNotes: null, cancelNote: null, itemIssueNote: null },
    });
    await tx.order.updateMany({
      where: { sellerUserId: userId },
      data: { pickupName: null, pickupPhone: null, pickupAddress: null, pickupNotes: null, failedNote: null },
    });

    // Listings no order needs go completely; the others keep only the title, price and status.
    await tx.listing.deleteMany({ where: { id: { in: listingIds }, orders: { none: {} } } });
    await tx.listing.updateMany({ where: { id: { in: listingIds }, status: { not: 'sold' } }, data: { status: 'withdrawn' } });
    await tx.listing.updateMany({
      where: { id: { in: listingIds } },
      data: { description: '', imageUrls: [], searchText: '', pickupPhone: null, pickupAddress: null, pickupNotes: null, testCertificateId: null },
    });

    // Sessions, devices, certificates, uploads, ID checks, messages, offers, bids, blocks,
    // signals, flags, reports they made and the support chat all cascade from here.
    await tx.user.delete({ where: { id: userId } });
  });

  // The database is done: now the files. A file that can't be removed is logged, not fatal.
  const publicFiles = [
    ...uploads.flatMap(u => [u.url, u.thumbUrl]),
    ...certificates.map(c => c.blurredUrl),
    ...listings.flatMap(l => l.imageUrls),
    user.avatarUrl,
  ].filter((url): url is string => !!url);
  const removals = [
    ...[...new Set(publicFiles)].map(url => storage.remove(url)),
    ...certificates.map(c => privateStorage.remove(c.photoUrl)),
    ...(user.cardToken ? [paymentProvider()?.deleteCard(user.cardToken)] : []),
  ];
  const results = await Promise.allSettled(removals);
  for (const result of results)
    if (result.status === 'rejected') logger.error({ err: result.reason, userId }, 'Deleted account: a file or card was not removed');
}
