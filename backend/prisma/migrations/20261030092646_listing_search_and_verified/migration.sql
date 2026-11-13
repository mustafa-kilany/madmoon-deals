-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sellerVerified" BOOLEAN NOT NULL DEFAULT false;
