-- Cleanup: drop isTestData column if it exists
ALTER TABLE "User" DROP COLUMN IF EXISTS "isTestData";
