DROP INDEX IF EXISTS "Ingredient_brandId_name_key";
DROP INDEX IF EXISTS "Inventory_brandId_ingredientId_key";
DROP INDEX IF EXISTS "Order_displayId_key";

ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3);
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "prepMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- Backfill legacy rows: map old brand-scoped data to brand's earliest store.
UPDATE "Ingredient" i
SET "storeId" = s.id
FROM (
  SELECT DISTINCT ON ("brandId") "brandId", id
  FROM "Store"
  ORDER BY "brandId", "createdAt" ASC
) s
WHERE i."storeId" IS NULL
  AND i."brandId" = s."brandId";

UPDATE "Inventory" i
SET "storeId" = s.id
FROM (
  SELECT DISTINCT ON ("brandId") "brandId", id
  FROM "Store"
  ORDER BY "brandId", "createdAt" ASC
) s
WHERE i."storeId" IS NULL
  AND i."brandId" = s."brandId";

UPDATE "MenuItem" m
SET "storeId" = s.id
FROM (
  SELECT DISTINCT ON ("brandId") "brandId", id
  FROM "Store"
  ORDER BY "brandId", "createdAt" ASC
) s
WHERE m."storeId" IS NULL
  AND m."brandId" = s."brandId";

CREATE INDEX IF NOT EXISTS "Ingredient_brandId_storeId_idx" ON "Ingredient"("brandId", "storeId");
CREATE UNIQUE INDEX IF NOT EXISTS "Ingredient_storeId_name_key" ON "Ingredient"("storeId", "name");

CREATE INDEX IF NOT EXISTS "Inventory_brandId_storeId_idx" ON "Inventory"("brandId", "storeId");
CREATE UNIQUE INDEX IF NOT EXISTS "Inventory_storeId_ingredientId_key" ON "Inventory"("storeId", "ingredientId");

CREATE INDEX IF NOT EXISTS "MenuItem_brandId_storeId_createdAt_idx" ON "MenuItem"("brandId", "storeId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_storeId_displayId_key" ON "Order"("storeId", "displayId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Ingredient_storeId_fkey'
  ) THEN
    ALTER TABLE "Ingredient"
    ADD CONSTRAINT "Ingredient_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Inventory_storeId_fkey'
  ) THEN
    ALTER TABLE "Inventory"
    ADD CONSTRAINT "Inventory_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MenuItem_storeId_fkey'
  ) THEN
    ALTER TABLE "MenuItem"
    ADD CONSTRAINT "MenuItem_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
