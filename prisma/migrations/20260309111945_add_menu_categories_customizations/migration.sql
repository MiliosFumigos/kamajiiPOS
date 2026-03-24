-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MenuItemCustomization" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceDelta" INTEGER NOT NULL,
    "maxQuantity" INTEGER NOT NULL,

    CONSTRAINT "MenuItemCustomization_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MenuItemCustomization" ADD CONSTRAINT "MenuItemCustomization_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
