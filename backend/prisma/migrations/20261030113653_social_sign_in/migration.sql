-- Google / Apple sign-in: the provider's account id ("sub") per user (new, empty columns)
ALTER TABLE "User" ADD COLUMN "appleId" TEXT,
ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");
