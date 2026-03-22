-- Remove isTestData column and delete test data users
DELETE FROM "User" WHERE "isTestData" = true;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isTestData";
