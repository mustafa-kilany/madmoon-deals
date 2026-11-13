-- Unread counts: how far each side of a chat has read.
ALTER TABLE "Chat" ADD COLUMN "buyerReadAt" TIMESTAMP(3),
ADD COLUMN "sellerReadAt" TIMESTAMP(3);

-- Chats from before this existed start as read: nobody should open the app to a wall of old "unread" messages.
UPDATE "Chat" SET "buyerReadAt" = "updatedAt", "sellerReadAt" = "updatedAt";
