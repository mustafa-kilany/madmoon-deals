-- A late bid moves an auction's end: this keeps the end the seller set, which the limit is counted from.
ALTER TABLE "Listing" ADD COLUMN "auctionOriginalEndsAt" TIMESTAMP(3);
