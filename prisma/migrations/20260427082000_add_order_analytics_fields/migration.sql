-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "completedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Order_brandId_storeId_paymentMethod_placedAt_idx"
ON "Order"("brandId", "storeId", "paymentMethod", "placedAt");

-- CreateIndex
CREATE INDEX "Order_brandId_storeId_createdByUserId_placedAt_idx"
ON "Order"("brandId", "storeId", "createdByUserId", "placedAt");

-- CreateIndex
CREATE INDEX "Order_brandId_storeId_completedByUserId_placedAt_idx"
ON "Order"("brandId", "storeId", "completedByUserId", "placedAt");

-- AddForeignKey
ALTER TABLE "Order"
ADD CONSTRAINT "Order_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order"
ADD CONSTRAINT "Order_completedByUserId_fkey"
FOREIGN KEY ("completedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
