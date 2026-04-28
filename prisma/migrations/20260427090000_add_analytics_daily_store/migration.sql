-- CreateTable
CREATE TABLE "AnalyticsDailyStore" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "cancelCount" INTEGER NOT NULL DEFAULT 0,
    "overtimeEligibleCount" INTEGER NOT NULL DEFAULT 0,
    "overtimeCount" INTEGER NOT NULL DEFAULT 0,
    "cashCount" INTEGER NOT NULL DEFAULT 0,
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnalyticsDailyStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyStore_storeId_date_key" ON "AnalyticsDailyStore"("storeId", "date");

-- CreateIndex
CREATE INDEX "AnalyticsDailyStore_brandId_date_idx" ON "AnalyticsDailyStore"("brandId", "date");

-- CreateIndex
CREATE INDEX "AnalyticsDailyStore_brandId_storeId_date_idx" ON "AnalyticsDailyStore"("brandId", "storeId", "date");

-- AddForeignKey
ALTER TABLE "AnalyticsDailyStore" ADD CONSTRAINT "AnalyticsDailyStore_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDailyStore" ADD CONSTRAINT "AnalyticsDailyStore_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
