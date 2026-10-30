-- CreateTable
CREATE TABLE "ListingView" (
    "listingId" TEXT NOT NULL,
    "viewerKey" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "ListingView_pkey" PRIMARY KEY ("listingId","viewerKey","day")
);

-- AddForeignKey
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
