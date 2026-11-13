-- AlterEnum
ALTER TYPE "EmailCodePurpose" ADD VALUE 'payout';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "payoutChangedAt" TIMESTAMP(3),
ADD COLUMN     "payoutHolder" TEXT,
ADD COLUMN     "payoutIban" TEXT,
ADD COLUMN     "payoutIbanLast4" TEXT;
