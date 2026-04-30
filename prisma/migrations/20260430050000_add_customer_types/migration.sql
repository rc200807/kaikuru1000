-- Add customerTypes JSON-encoded array column to User
ALTER TABLE "User" ADD COLUMN "customerTypes" TEXT NOT NULL DEFAULT '[]';

-- Backfill existing rows: customerTypes = ["<customerType>"]
UPDATE "User" SET "customerTypes" = ('["' || "customerType" || '"]') WHERE "customerTypes" = '[]';
