-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('owner', 'operations', 'support', 'finance');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRole" "AdminRole";

-- Admins made before admin types own the dashboard (B15.7).
UPDATE "User" SET "adminRole" = 'owner' WHERE "role" = 'admin';
