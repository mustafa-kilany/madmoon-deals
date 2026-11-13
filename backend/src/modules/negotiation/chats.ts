import { prisma } from '../../db';
import { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { pushChatMessage } from '../notifications/notify';
import { blockedWith, isBlockedBetween } from '../safety/blocks';
import { announceAfterSaving, announceToUsers } from './live';
import { chatInclude, messageInclude } from './shapes';

// Chats (BACKEND_PLAN B6.1): one per buyer and listing, started by the buyer's
// first offer. Both sides can then write.

export const MESSAGE_MAX = 1000;
const PAGE = 50;

type Tx = Prisma.TransactionClient;

/** Adds a message and makes it the chat's last one (the chat list shows it). */
export async function post(tx: Tx, chatId: string, senderId: string, text: string, offerId?: string) {
  const message = await tx.message.create({ data: { chatId, senderId, text, offerId }, include: messageInclude });
  const chat = await tx.chat.update({
    where: { id: chatId },
    data: { lastMessage: text, updatedAt: message.createdAt },
    select: { buyerId: true, listing: { select: { sellerUserId: true } } },
  });
  await announceToUsers(tx, [chat.buyerId, chat.listing.sellerUserId], { type: 'chat', chatId });
  return message;
}

/** GET /chats: mine as buyer or seller, latest activity first; none with people I blocked or who blocked me. */
export async function listChats(userId: string) {
  const hidden = await blockedWith(userId);
  return prisma.chat.findMany({
    where: {
      OR: [{ buyerId: userId }, { listing: { sellerUserId: userId } }],
      ...(hidden.length && {
        buyerId: { notIn: hidden },
        listing: { OR: [{ sellerUserId: null }, { sellerUserId: { notIn: hidden } }] },
      }),
    },
    include: chatInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: 200,
  });
}

/** For each of my chats that has any: how many messages from the other person I haven't read. */
export async function unreadCounts(userId: string, chatIds: string[]) {
  if (!chatIds.length) return new Map<string, number>();
  const rows = await prisma.$queryRaw<{ chatId: string; unread: number }[]>`
    SELECT m."chatId", COUNT(*)::int AS "unread"
    FROM "Message" m JOIN "Chat" c ON c."id" = m."chatId"
    WHERE m."chatId" IN (${Prisma.join(chatIds)})
      AND m."senderId" <> ${userId}
      AND m."createdAt" > COALESCE(CASE WHEN c."buyerId" = ${userId} THEN c."buyerReadAt" ELSE c."sellerReadAt" END, '-infinity'::timestamp)
    GROUP BY m."chatId"`;
  return new Map(rows.map(row => [row.chatId, row.unread]));
}

/** A chat the user is part of; anyone else gets 404 (they can't tell it exists). */
export async function chatFor(userId: string, chatId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: chatInclude });
  if (!chat || (chat.buyerId !== userId && chat.listing.sellerUserId !== userId))
    throw new ApiError(404, 'NOT_FOUND', `No chat ${chatId}`);
  return chat;
}

/** GET /chats/:id/messages: the latest 50 (or before a message), oldest first. */
export async function listMessages(userId: string, chatId: string, before?: string, limit = PAGE) {
  await chatFor(userId, chatId);
  const cursor = before ? await prisma.message.findFirst({ where: { id: before, chatId } }) : null;
  if (before && !cursor) throw new ApiError(422, 'VALIDATION', 'before: not a message of this chat');
  const newest = await prisma.message.findMany({
    where: {
      chatId,
      ...(cursor && {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      }),
    },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(limit, 1), PAGE),
  });
  return newest.reverse();
}

/** POST /chats/:id/messages. Not between people who blocked each other. */
export async function sendMessage(userId: string, chatId: string, text: string) {
  const chat = await chatFor(userId, chatId);
  const other = chat.buyerId === userId ? chat.listing.sellerUserId : chat.buyerId;
  if (other && (await isBlockedBetween(userId, other)))
    throw new ApiError(403, 'FORBIDDEN', 'You can’t message this person');
  const message = await prisma.$transaction(tx => post(tx, chatId, userId, text));
  pushChatMessage(chatId, userId);
  return message;
}

/**
 * POST /chats/:id/read: I've read up to this message. Never moves backward, whichever phone answers
 * last. My other phones hear of it; the other person doesn't (no read receipts).
 */
export async function markChatRead(userId: string, chatId: string, messageId: string) {
  const chat = await chatFor(userId, chatId);
  const message = await prisma.message.findFirst({ where: { id: messageId, chatId }, select: { createdAt: true } });
  if (!message) throw new ApiError(422, 'VALIDATION', 'messageId: not a message of this chat');
  const field = chat.buyerId === userId ? 'buyerReadAt' : 'sellerReadAt';
  const { count } = await prisma.chat.updateMany({
    where: { id: chatId, OR: [{ [field]: null }, { [field]: { lt: message.createdAt } }] },
    data: { [field]: message.createdAt },
  });
  if (count) await announceAfterSaving([userId], { type: 'chat', chatId });
}
