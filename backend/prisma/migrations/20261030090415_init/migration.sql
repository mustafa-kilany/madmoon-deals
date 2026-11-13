-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('email', 'google', 'apple');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('courier', 'admin');

-- CreateEnum
CREATE TYPE "EmailCodePurpose" AS ENUM ('signup', 'reset');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('new', 'excellent', 'good', 'loved', 'refurbished_like_new', 'refurbished_excellent', 'refurbished_good');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('active', 'reserved', 'sold', 'withdrawn');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('fixed', 'auction');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('passed', 'failed');

-- CreateEnum
CREATE TYPE "IdProvider" AS ENUM ('sanad', 'manual');

-- CreateEnum
CREATE TYPE "IdVerificationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "RiskFlagStatus" AS ENUM ('open', 'dismissed', 'actioned');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "method" "AuthMethod" NOT NULL DEFAULT 'email',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "cityId" TEXT NOT NULL DEFAULT 'amman',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "role" "Role",
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "EmailCodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "priceFils" INTEGER NOT NULL,
    "imageUrls" TEXT[],
    "condition" "Condition" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "brand" TEXT,
    "model" TEXT,
    "locationId" TEXT NOT NULL,
    "saleType" "SaleType" NOT NULL DEFAULT 'fixed',
    "auctionEndsAt" TIMESTAMP(3),
    "incrementFils" INTEGER,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sellerUserId" TEXT,
    "storeId" TEXT,
    "sku" TEXT,
    "warrantyMonths" INTEGER,
    "testCertificateId" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreApiKey" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "StoreApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefurbishedImport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "withdrawn" INTEGER NOT NULL,
    "errors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefurbishedImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCertificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL,
    "problems" TEXT[],
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "shopName" TEXT,
    "shopPhone" TEXT,
    "testedAt" TIMESTAMP(3),
    "device" TEXT,
    "specs" TEXT[],
    "photoUrl" TEXT NOT NULL,
    "blurredUrl" TEXT,
    "imageHash" TEXT,
    "serialHashes" TEXT[],
    "ocrProvider" TEXT NOT NULL,
    "ocrText" TEXT NOT NULL,
    "stampChecked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IdProvider" NOT NULL,
    "status" "IdVerificationStatus" NOT NULL DEFAULT 'pending',
    "providerRef" TEXT,
    "nationalIdHash" TEXT,
    "photoUrl" TEXT,
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "IdVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "AccountSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "aiSummary" TEXT,
    "aiModel" TEXT,
    "status" "RiskFlagStatus" NOT NULL DEFAULT 'open',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");

-- CreateIndex
CREATE INDEX "EmailCode_email_purpose_idx" ON "EmailCode"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_testCertificateId_key" ON "Listing"("testCertificateId");

-- CreateIndex
CREATE INDEX "Listing_category_status_idx" ON "Listing"("category", "status");

-- CreateIndex
CREATE INDEX "Listing_sellerUserId_idx" ON "Listing"("sellerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_storeId_sku_key" ON "Listing"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "StoreApiKey_keyHash_key" ON "StoreApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "RefurbishedImport_storeId_createdAt_idx" ON "RefurbishedImport"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "TestCertificate_userId_idx" ON "TestCertificate"("userId");

-- CreateIndex
CREATE INDEX "TestCertificate_imageHash_idx" ON "TestCertificate"("imageHash");

-- CreateIndex
CREATE INDEX "IdVerification_userId_idx" ON "IdVerification"("userId");

-- CreateIndex
CREATE INDEX "IdVerification_nationalIdHash_idx" ON "IdVerification"("nationalIdHash");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- CreateIndex
CREATE INDEX "AccountSignal_userId_createdAt_idx" ON "AccountSignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskFlag_status_createdAt_idx" ON "RiskFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RiskFlag_userId_idx" ON "RiskFlag"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_testCertificateId_fkey" FOREIGN KEY ("testCertificateId") REFERENCES "TestCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreApiKey" ADD CONSTRAINT "StoreApiKey_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefurbishedImport" ADD CONSTRAINT "RefurbishedImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCertificate" ADD CONSTRAINT "TestCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdVerification" ADD CONSTRAINT "IdVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSignal" ADD CONSTRAINT "AccountSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFlag" ADD CONSTRAINT "RiskFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFlag" ADD CONSTRAINT "RiskFlag_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
