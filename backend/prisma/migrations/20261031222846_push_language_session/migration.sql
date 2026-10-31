-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "sessionId" TEXT;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
