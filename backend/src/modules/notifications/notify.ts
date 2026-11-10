import { reasonLabel } from '@/lib/deliveryProblems';
import { formatJOD } from '@/lib/money';
import type { Lang } from '@/lib/types';
import { prisma } from '../../db';
import { defineJob } from '../../lib/jobs';
import { announceAfterSaving } from '../negotiation/live';
import { pushSender, type PushMessage } from './push';

// The pushes Sahla sends (BACKEND_PLAN B9.3; docs/API.md → Live Updates &
// Notifications). Each is a job (lib/jobs.ts): it runs a moment after the request, survives a
// restart, is tried again if sending fails, reads what is true then,
// and is written in the language of each phone. Never the text of a chat
// message: phones show pushes on the lock screen.

type Text = { title: string; body: string };
type Build = (lang: Lang) => Text;

const titleOf = (listing: { titleAr: string; titleEn: string }, lang: Lang) =>
  lang === 'ar' ? listing.titleAr : listing.titleEn;

/** M2: chats and support have their own unread counts, so they aren't copied into the inbox. */
const NOT_IN_INBOX = new Set(['chat', 'support']);

/** The inbox copy, once: a job tried again after a failed send doesn't add it twice. */
async function keepInInbox(userId: string, build: Build, data: PushMessage['data']) {
  if (NOT_IN_INBOX.has(data.type)) return;
  const [ar, en] = [build('ar'), build('en')];
  const row = { userId, type: data.type, refId: data.id || null, titleAr: ar.title, bodyAr: ar.body, titleEn: en.title, bodyEn: en.body };
  if (await prisma.notification.findFirst({ where: { ...row, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } }, select: { id: true } })) return;
  await prisma.notification.create({ data: row });
  await announceAfterSaving([userId], { type: 'notifications' });
}

/**
 * Into the person's inbox (even with pushes off or no phone registered), then to every registered
 * phone of theirs (none for suspended accounts), forgetting uninstalled apps.
 */
async function sendTo(userId: string | null, build: Build, data: PushMessage['data']) {
  if (!userId) return;
  await keepInInbox(userId, build, data);
  const sender = pushSender();
  if (!sender) return;
  const devices = await prisma.device.findMany({
    // Not phones whose sign-in expired (still registered, but nobody is signed in there).
    where: { userId, user: { suspended: false }, OR: [{ sessionId: null }, { session: { expiresAt: { gt: new Date() } } }] },
  });
  for (const device of devices) {
    const lang: Lang = device.language === 'ar' ? 'ar' : 'en';
    const result = await sender.send(device.token, { ...build(lang), data });
    if (result === 'gone') await prisma.device.deleteMany({ where: { token: device.token } });
  }
}

/** A chat message to the other person. A burst of messages → one push. */
export function pushChatMessage(chatId: string, senderId: string) {
  pushChatMessageJob.soon({ chatId, senderId }, `push:chat:${chatId}:${senderId}`);
}
const pushChatMessageJob = defineJob('pushChatMessage', async ({ chatId, senderId }: { chatId: string; senderId: string }) => {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { listing: { select: { titleAr: true, titleEn: true, sellerUserId: true } } },
  });
  if (!chat) return;
  const to = senderId === chat.buyerId ? chat.listing.sellerUserId : chat.buyerId;
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
  const name = sender?.name ?? '';
  await sendTo(
    to,
    lang => ({
      title: titleOf(chat.listing, lang),
      body: lang === 'ar' ? `رسالة جديدة من ${name}` : `New message from ${name}`,
    }),
    { type: 'chat', id: chatId },
  );
});

/** A new offer (to the seller) or an answer to one (to the other side). */
export function pushOffer(offerId: string, actorId: string) {
  pushOfferJob.soon({ offerId, actorId }, `push:offer:${offerId}:${actorId}`);
}
const pushOfferJob = defineJob('pushOffer', async ({ offerId, actorId }: { offerId: string; actorId: string }) => {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { listing: { select: { titleAr: true, titleEn: true, sellerUserId: true } } },
  });
  if (!offer) return;
  const to = actorId === offer.buyerId ? offer.listing.sellerUserId : offer.buyerId;
  const body = (lang: Lang) => {
    const price = (fils: number) => formatJOD(fils, lang);
    switch (offer.status) {
      case 'pending':
        return lang === 'ar' ? `عرض جديد: ${price(offer.amountFils)}` : `New offer: ${price(offer.amountFils)}`;
      case 'countered':
        return lang === 'ar'
          ? `عرض مقابل: ${price(offer.counterAmountFils ?? 0)}`
          : `Counter-offer: ${price(offer.counterAmountFils ?? 0)}`;
      case 'accepted':
        return lang === 'ar' ? `تم قبول العرض: ${price(offer.amountFils)}` : `Offer accepted: ${price(offer.amountFils)}`;
      default:
        return lang === 'ar' ? 'تم رفض العرض' : 'Offer declined';
    }
  };
  await sendTo(to, lang => ({ title: titleOf(offer.listing, lang), body: body(lang) }), { type: 'offer', id: offer.chatId });
});

/** Someone bid over this bidder. Several bids over them in a moment → one push with the latest price. */
export function pushOutbid(listingId: string, outbidUserId: string) {
  pushOutbidJob.soon({ listingId, outbidUserId }, `push:outbid:${listingId}:${outbidUserId}`);
}
const pushOutbidJob = defineJob('pushOutbid', async ({ listingId, outbidUserId }: { listingId: string; outbidUserId: string }) => {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== 'active') return;
  const top = await prisma.bid.findFirst({ where: { listingId }, orderBy: [{ amountFils: 'desc' }, { createdAt: 'asc' }] });
  if (top?.bidderId === outbidUserId) return; // they bid again meanwhile
  await sendTo(
    outbidUserId,
    lang => ({
      title: titleOf(listing, lang),
      body:
        lang === 'ar'
          ? `تمت المزايدة على عرضك: السعر الآن ${formatJOD(listing.priceFils, lang)}`
          : `You've been outbid: the bid is now ${formatJOD(listing.priceFils, lang)}`,
    }),
    { type: 'outbid', id: listingId },
  );
});

/** The auction ended with this bidder on top. */
export function pushAuctionWon(listingId: string) {
  pushAuctionWonJob.soon({ listingId }, `push:won:${listingId}`);
}
const pushAuctionWonJob = defineJob('pushAuctionWon', async ({ listingId }: { listingId: string }) => {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing?.auctionWinnerId) return;
  await sendTo(
    listing.auctionWinnerId,
    lang => ({
      title: titleOf(listing, lang),
      body:
        lang === 'ar'
          ? `فزت بالمزاد بسعر ${formatJOD(listing.priceFils, lang)}. ادفع ليصلك المنتج.`
          : `You won the auction at ${formatJOD(listing.priceFils, lang)}. Pay to get it delivered.`,
    }),
    { type: 'auction_won', id: listingId },
  );
});

/** The courier delivered: the buyer, and the seller (their money is released). */
export function pushDelivered(orderId: string) {
  pushDeliveredJob.soon({ orderId }, `push:delivered:${orderId}`);
}
const pushDeliveredJob = defineJob('pushDelivered', async ({ orderId }: { orderId: string }) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { listing: { select: { titleAr: true, titleEn: true } } },
  });
  if (!order || order.status !== 'completed') return;
  await sendTo(
    order.buyerId,
    lang => ({
      title: titleOf(order.listing, lang),
      body: lang === 'ar' ? `تم توصيل طلبك ${order.id}.` : `Your order ${order.id} was delivered.`,
    }),
    { type: 'order', id: orderId },
  );
  await sendTo(
    order.sellerUserId,
    lang => ({
      title: titleOf(order.listing, lang),
      body:
        lang === 'ar'
          ? `تم التوصيل للمشتري. سيتم تحويل ${formatJOD(order.itemPriceFils, lang)} إليك.`
          : `Delivered to the buyer. ${formatJOD(order.itemPriceFils, lang)} will be paid out to you.`,
    }),
    { type: 'sale', id: orderId },
  );
});

/**
 * B15.1: the buyer paid. The seller hears at once (the listing left browsing in the
 * same transaction as the payment), so they get the item ready for the driver.
 */
export function pushSold(orderId: string) {
  pushSoldJob.soon({ orderId }, `push:sold:${orderId}`);
}
const pushSoldJob = defineJob('pushSold', async ({ orderId }: { orderId: string }) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { listing: { select: { titleAr: true, titleEn: true } } },
  });
  if (!order || order.status !== 'escrow_held') return;
  await sendTo(
    order.sellerUserId,
    lang => ({
      title: titleOf(order.listing, lang),
      body:
        lang === 'ar'
          ? `تم البيع! دفع المشتري ${formatJOD(order.itemPriceFils, lang)}. جهّز المنتج، سيأتي سائق سهلة لاستلامه.`
          : `Sold! The buyer paid ${formatJOD(order.itemPriceFils, lang)}. Get the item ready: a Sahla driver will pick it up.`,
    }),
    { type: 'sale', id: orderId },
  );
});

/** B15.5: an admin gave this order to a driver. */
export function pushAssigned(orderId: string) {
  pushAssignedJob.soon({ orderId }, `push:assigned:${orderId}`);
}
const pushAssignedJob = defineJob('pushAssigned', async ({ orderId }: { orderId: string }) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { listing: { select: { titleAr: true, titleEn: true } } },
  });
  if (!order?.courierId || order.status !== 'escrow_held' || order.courierStatus !== 'to_pickup') return;
  await sendTo(
    order.courierId,
    lang => ({
      title: titleOf(order.listing, lang),
      body: lang === 'ar' ? `توصيلة جديدة: الطلب ${order.id}.` : `New delivery: order ${order.id}.`,
    }),
    { type: 'delivery', id: orderId },
  );
});

/** B15.5: the driver has the item: the buyer should be ready to receive it. */
export function pushPickedUp(orderId: string) {
  pushPickedUpJob.soon({ orderId }, `push:picked:${orderId}`);
}
const pushPickedUpJob = defineJob('pushPickedUp', async ({ orderId }: { orderId: string }) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { listing: { select: { titleAr: true, titleEn: true } } },
  });
  if (!order || order.courierStatus !== 'picked_up') return;
  await sendTo(
    order.buyerId,
    lang => ({
      title: titleOf(order.listing, lang),
      body:
        lang === 'ar'
          ? `طلبك ${order.id} في الطريق إليك. جهّز رمز التسليم.`
          : `Your order ${order.id} is on the way. Have your delivery PIN ready.`,
    }),
    { type: 'order', id: orderId },
  );
});

const orderWithTitle = (orderId: string) =>
  prisma.order.findUnique({ where: { id: orderId }, include: { listing: { select: { titleAr: true, titleEn: true } } } });

/** B15.3: the buyer cancelled before pickup: the seller (item on sale again) and the driver, if one was assigned. */
export function pushCancelled(orderId: string, courierId: string | null) {
  pushCancelledJob.soon({ orderId, courierId }, `push:cancelled:${orderId}`);
}
const pushCancelledJob = defineJob('pushCancelled', async ({ orderId, courierId }: { orderId: string; courierId: string | null }) => {
  const order = await orderWithTitle(orderId);
  if (!order || order.status !== 'cancelled') return;
  await sendTo(
    order.sellerUserId,
    lang => ({
      title: titleOf(order.listing, lang),
      body:
        lang === 'ar'
          ? `ألغى المشتري الطلب ${order.id} قبل الاستلام. إعلانك معروض للبيع من جديد.`
          : `The buyer cancelled order ${order.id} before pickup. Your listing is on sale again.`,
    }),
    { type: 'sale', id: orderId },
  );
  await sendTo(
    courierId,
    lang => ({
      title: titleOf(order.listing, lang),
      body: lang === 'ar' ? `أُلغي الطلب ${order.id}: لا تذهب للاستلام.` : `Order ${order.id} was cancelled: don’t go to pick it up.`,
    }),
    { type: 'delivery', id: orderId },
  );
});

/** B15.4: the buyer reported a problem with the item at the door: the driver sees it at once. */
export function pushItemIssue(orderId: string) {
  pushItemIssueJob.soon({ orderId }, `push:issue:${orderId}`);
}
const pushItemIssueJob = defineJob('pushItemIssue', async ({ orderId }: { orderId: string }) => {
  const order = await orderWithTitle(orderId);
  if (!order?.itemIssueReason) return;
  const reason = reasonLabel(order.itemIssueReason);
  await sendTo(
    order.courierId,
    lang => ({
      title: titleOf(order.listing, lang),
      body: lang === 'ar' ? `أبلغ المشتري عن مشكلة: ${reason.ar}` : `The buyer reported a problem: ${reason.en}`,
    }),
    { type: 'delivery', id: orderId },
  );
});

/** B15.4: the driver couldn't finish: the buyer and the seller, with the reason. */
export function pushDeliveryFailed(orderId: string) {
  pushDeliveryFailedJob.soon({ orderId }, `push:failed:${orderId}`);
}
const pushDeliveryFailedJob = defineJob('pushDeliveryFailed', async ({ orderId }: { orderId: string }) => {
  const order = await orderWithTitle(orderId);
  if (!order?.failedReason || order.courierStatus !== 'failed') return;
  const reason = reasonLabel(order.failedReason);
  const atSeller = order.failedStage === 'pickup';
  const text = (lang: Lang) => ({
    title: titleOf(order.listing, lang),
    body:
      lang === 'ar'
        ? `${atSeller ? 'لم يتم استلام' : 'لم يتم توصيل'} الطلب ${order.id}: ${reason.ar}. سيتواصل معك فريق سهلة.`
        : `Order ${order.id} wasn’t ${atSeller ? 'picked up' : 'delivered'}: ${reason.en}. Sahla’s team will follow up.`,
  });
  await sendTo(order.buyerId, text, { type: 'order', id: orderId });
  await sendTo(order.sellerUserId, text, { type: 'sale', id: orderId });
});

/** B15.4: an admin decided: try the delivery again, or refund the buyer. */
export function pushProblemResolved(orderId: string, action: 'retry' | 'refund') {
  pushProblemResolvedJob.soon({ orderId, action }, `push:resolved:${orderId}:${action}`);
}
const pushProblemResolvedJob = defineJob('pushProblemResolved', async ({ orderId, action }: { orderId: string; action: 'retry' | 'refund' }) => {
  const order = await orderWithTitle(orderId);
  if (!order) return;
  if (action === 'refund') {
    await sendTo(
      order.buyerId,
      lang => ({
        title: titleOf(order.listing, lang),
        body:
          lang === 'ar'
            ? `أُعيد إليك مبلغ الطلب ${order.id} (${formatJOD(order.totalFils, lang)}).`
            : `Order ${order.id} was refunded (${formatJOD(order.totalFils, lang)}).`,
      }),
      { type: 'order', id: orderId },
    );
    await sendTo(
      order.sellerUserId,
      lang => ({
        title: titleOf(order.listing, lang),
        body: lang === 'ar' ? `أُلغي الطلب ${order.id} وأُعيد المبلغ للمشتري.` : `Order ${order.id} was cancelled and the buyer refunded.`,
      }),
      { type: 'sale', id: orderId },
    );
    return;
  }
  await sendTo(
    order.buyerId,
    lang => ({
      title: titleOf(order.listing, lang),
      body: lang === 'ar' ? `سنحاول توصيل الطلب ${order.id} مرة أخرى.` : `We’ll try delivering order ${order.id} again.`,
    }),
    { type: 'order', id: orderId },
  );
  await sendTo(
    order.courierId,
    lang => ({
      title: titleOf(order.listing, lang),
      body: lang === 'ar' ? `أعيد إليك الطلب ${order.id} لمحاولة جديدة.` : `Order ${order.id} is back on your list to try again.`,
    }),
    { type: 'delivery', id: orderId },
  );
});

/**
 * An admin took the seller's listing off sale (B8.3: reports, a rejected test
 * certificate). The reason itself stays in the audit log; the push says what
 * happened and where to ask.
 */
export function pushListingRemoved(listingId: string, why: 'reports' | 'certificate') {
  pushListingRemovedJob.soon({ listingId, why }, `push:removed:${listingId}`);
}
const pushListingRemovedJob = defineJob('pushListingRemoved', async ({ listingId, why }: { listingId: string; why: 'reports' | 'certificate' }) => {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== 'withdrawn') return;
  await sendTo(
    listing.sellerUserId,
    lang => ({
      title: titleOf(listing, lang),
      body:
        why === 'certificate'
          ? lang === 'ar'
            ? 'أزلنا إعلانك لأن شهادة الفحص لم تجتز المراجعة. يمكنك نشره من جديد بشهادة من محل فحص.'
            : 'We took your listing down: its test certificate didn’t pass our review. You can list it again with a certificate from a testing shop.'
          : lang === 'ar'
            ? 'أزلنا إعلانك بعد بلاغات من المستخدمين لأنه يخالف قواعد سهلة. تواصل مع الدعم إن كان هناك خطأ.'
            : 'We took your listing down after reports from other users: it breaks Sahla’s rules. Contact support if you think this is a mistake.',
    }),
    { type: 'sale', id: listingId },
  );
});

/** S3.7: the bank account for the person's money was set or changed: if it wasn't them, they must act now. */
export function pushPayoutAccountChanged(userId: string, last4: string) {
  pushPayoutAccountChangedJob.soon({ userId, last4 }, `push:payout-account:${userId}`);
}
const pushPayoutAccountChangedJob = defineJob('pushPayoutAccountChanged', async ({ userId, last4 }: { userId: string; last4: string }) => {
  await sendTo(
    userId,
    lang => ({
      title: lang === 'ar' ? 'الحساب البنكي' : 'Bank account',
      body:
        lang === 'ar'
          ? `تم تحديث حسابك البنكي (ينتهي بـ ${last4}). إذا لم تكن أنت، تواصل مع الدعم فوراً.`
          : `Your bank account was updated (ends in ${last4}). If this wasn’t you, contact support right away.`,
    }),
    { type: 'sale', id: userId },
  );
});

/** B15.6: Sahla's support team answered (never the text: it shows on the lock screen). */
export function pushSupportReply(userId: string) {
  pushSupportReplyJob.soon({ userId }, 'push:support:' + userId);
}
const pushSupportReplyJob = defineJob('pushSupportReply', async ({ userId }: { userId: string }) => {
  await sendTo(
    userId,
    lang => ({
      title: lang === 'ar' ? 'دعم سهلة' : 'Sahla support',
      body: lang === 'ar' ? 'وصلك رد من فريق الدعم.' : 'The support team answered you.',
    }),
    { type: 'support', id: userId },
  );
});
