-- ID verification is Sanad only (decided 2026-10-30): no ID photos, no manual review.
DELETE FROM "IdVerification" WHERE "provider" = 'manual';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "idVerification";

-- AlterEnum
BEGIN;
CREATE TYPE "IdProvider_new" AS ENUM ('sanad');
ALTER TABLE "IdVerification" ALTER COLUMN "provider" TYPE "IdProvider_new" USING ("provider"::text::"IdProvider_new");
ALTER TYPE "IdProvider" RENAME TO "IdProvider_old";
ALTER TYPE "IdProvider_new" RENAME TO "IdProvider";
DROP TYPE "public"."IdProvider_old";
COMMIT;

-- AlterTable
ALTER TABLE "IdVerification" DROP COLUMN "photoUrl",
DROP COLUMN "reviewedById",
ADD COLUMN     "stateHash" TEXT,
ALTER COLUMN "provider" SET DEFAULT 'sanad';

-- CreateIndex
CREATE UNIQUE INDEX "IdVerification_stateHash_key" ON "IdVerification"("stateHash");
