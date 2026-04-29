-- Add brand-level branding assets (nullable for backward compatibility)
ALTER TABLE "Brand"
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "faviconUrl" TEXT;
