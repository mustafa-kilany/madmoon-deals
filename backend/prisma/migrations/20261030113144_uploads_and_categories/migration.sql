-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('listing', 'avatar', 'category');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "bytes" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_url_key" ON "Upload"("url");

-- CreateIndex
CREATE INDEX "Upload_kind_usedAt_createdAt_idx" ON "Upload"("kind", "usedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Upload_userId_idx" ON "Upload"("userId");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
