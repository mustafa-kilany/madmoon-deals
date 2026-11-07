import { formatJOD } from '@/lib/money';
import type { Lang } from '@/lib/types';
import { prisma } from '../../db';
import { runSoon } from '../../lib/jobs';
import { logger } from '../../lib/logger';
import { pushSender, type PushMessage } from './push';

// The pushes Sahla sends (BACKEND_PLAN B9.3; docs/API.md → Live Updates &
// Notifications). Each runs a moment after the request, reads what is true then,
// and is written in the language of each phone. Never the text of a chat
// message: phones show pushes on the lock screen.

type Text = { title: string; body: string };
type Build = (lang: Lang) => Text;

const titleOf = (listing: { titleAr: string; titleEn: string }, lang: Lang) =>
  lang === 'ar' ? listing.titleAr : listing.titleEn;

/** Every registered phone of the user (none for suspended accounts); forgets uninstalled apps. */
async function sendTo(userId: string | null, build: Build, data: PushMessage['data']) {
  const sender = pushSender();
  if (!sender || !userId) return;
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

const later = (key: string, job: () => Promise<void>) =>
  runSoon(key, () => job().catch(error => logger.error({ err: error, key }, 'Push failed')));

/** A chat message to the other person. A burst of messages → one push. */
export function pushChatMessage(chatId: string, senderId: string) {
  later(`push:chat:${chatId}:${senderId}`, async () => {
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
}

/** A new offer (to the seller) or an answer to one (to the other side). */
export function pushOffer(offerId: string, actorId: string) {
  later(`push:offer:${offerId}:${actorId}`, async () => {
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
}

/** Someone bid over this bidder. Several bids over them in a moment → one push with the latest price. */
export function pushOutbid(listingId: string, outbidUserId: string) {
  later(`push:outbid:${listingId}:${outbidUserId}`, async () => {
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
}

/** The auction ended with this bidder on top. */
export function pushAuctionWon(listingId: string) {
  later(`push:won:${listingId}`, async () => {
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
}

/** The courier delivered: the buyer, and the seller (their money is released). */
export function pushDelivered(orderId: string) {
  later(`push:delivered:${orderId}`, async () => {
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
}

/**
 * B15.1: the buyer paid. The seller hears at once (the listing left browsing in the
 * same transaction as the payment), so they get the item ready for the driver.
 */
export function pushSold(orderId: string) {
  later(`push:sold:${orderId}`, async () => {
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
}

/** B15.5: an admin gave this order to a driver. */
export function pushAssigned(orderId: string) {
  later(`push:assigned:${orderId}`, async () => {
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
}

/** B15.5: the driver has the item: the buyer should be ready to receive it. */
export function pushPickedUp(orderId: string) {
  later(`push:picked:${orderId}`, async () => {
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
}

/**
 * An admin took the seller's listing off sale (B8.3: reports, a rejected test
 * certificate). The reason itself stays in the audit log; the push says what
 * happened and where to ask.
 */
export function pushListingRemoved(listingId: string, why: 'reports' | 'certificate') {
  later(`push:removed:${listingId}`, async () => {
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
}
