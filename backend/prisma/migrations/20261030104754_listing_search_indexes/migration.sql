-- Trigram matching for LIKE %word% search (built into PostgreSQL, off by default)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Listing_searchText_idx" ON "Listing" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Listing_status_saleType_auctionEndsAt_idx" ON "Listing"("status", "saleType", "auctionEndsAt");

-- CreateIndex
CREATE INDEX "Listing_status_sellerVerified_createdAt_idx" ON "Listing"("status", "sellerVerified", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_priceFils_idx" ON "Listing"("status", "priceFils");

-- CreateIndex
CREATE INDEX "Listing_locationId_idx" ON "Listing"("locationId");
