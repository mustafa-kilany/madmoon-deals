-- AlterEnum
ALTER TYPE "CourierStatus" ADD VALUE 'failed';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelNote" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failedNote" TEXT,
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "failedStage" TEXT,
ADD COLUMN     "itemIssueAt" TIMESTAMP(3),
ADD COLUMN     "itemIssueNote" TEXT,
ADD COLUMN     "itemIssueReason" TEXT,
ADD COLUMN     "problemResolution" TEXT,
ADD COLUMN     "problemResolvedAt" TIMESTAMP(3);
