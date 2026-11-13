-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupNotes" TEXT,
ADD COLUMN     "pickupPhone" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupCityId" TEXT,
ADD COLUMN     "pickupPhone" TEXT;
