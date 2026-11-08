import type { Request } from 'express';
import { prisma } from '../../db';
import type { User } from '../../generated/prisma/client';
import { LIMIT_PER_KIND, listingCopy, orderCopy } from './exportShapes';
import { toApiUser } from './apiUser';

// GET /me/export (SECURITY_PLAN S8.4; Jordan's PDPL right of access): a copy of what
// Sahla holds about this person, in plain JSON. Things only they gave or did, never
// secrets (password hash, card token, whole IBAN) or other people's private details.

export async function exportAccount(user: User, req: Request) {
  const id = user.id;
  const take = LIMIT_PER_KIND;
  const [listings, purchases, sales, messages, offers, bids, reports, blocks, certificates, checks, devices, support] = await Promise.all([
    prisma.listing.findMany({ where: { sellerUserId: id }, orderBy: { createdAt: 'desc' }, take }),
    prisma.order.findMany({ where: { buyerId: id }, orderBy: { createdAt: 'desc' }, take }),
    prisma.order.findMany({ where: { sellerUserId: id, status: { not: 'awaiting_payment' } }, orderBy: { createdAt: 'desc' }, take }),
    prisma.message.findMany({ where: { senderId: id }, orderBy: { createdAt: 'desc' }, take, select: { chatId: true, text: true, createdAt: true } }),
    prisma.offer.findMany({ where: { buyerId: id }, orderBy: { createdAt: 'desc' }, take, select: { listingId: true, amountFils: true, counterAmountFils: true, status: true, createdAt: true } }),
    prisma.bid.findMany({ where: { bidderId: id }, orderBy: { createdAt: 'desc' }, take, select: { listingId: true, amountFils: true, createdAt: true } }),
    prisma.report.findMany({ where: { reporterId: id }, orderBy: { createdAt: 'desc' }, take, select: { targetType: true, targetId: true, reason: true, details: true, createdAt: true } }),
    prisma.block.findMany({ where: { blockerId: id }, select: { createdAt: true, blocked: { select: { name: true } } } }),
    prisma.testCertificate.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take, select: { status: true, type: true, brand: true, model: true, shopName: true, testedAt: true, createdAt: true } }),
    prisma.idVerification.findMany({ where: { userId: id }, select: { provider: true, status: true, consentVersion: true, consentAt: true, createdAt: true, decidedAt: true } }),
    prisma.device.findMany({ where: { userId: id }, select: { platform: true, language: true, createdAt: true } }),
    prisma.supportMessage.findMany({ where: { thread: { userId: id } }, orderBy: { createdAt: 'desc' }, take, select: { fromSupport: true, text: true, orderId: true, createdAt: true } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      ...toApiUser(user, req),
      termsAcceptedAt: user.termsAcceptedAt,
      createdAt: user.createdAt,
      ...(user.payoutIbanLast4 && { bankAccount: { holderName: user.payoutHolder, ibanLast4: user.payoutIbanLast4 } }),
    },
    listings: listings.map(listingCopy),
    purchases: purchases.map(o => orderCopy(o, 'buyer')),
    sales: sales.map(o => orderCopy(o, 'seller')),
    messagesSent: messages,
    offersMade: offers,
    bids,
    reportsMade: reports,
    blocked: blocks.map(b => ({ name: b.blocked.name, since: b.createdAt })),
    testCertificates: certificates,
    idChecks: checks,
    devices,
    supportMessages: support,
  };
}
