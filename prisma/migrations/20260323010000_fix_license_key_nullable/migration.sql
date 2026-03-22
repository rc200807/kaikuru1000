-- Fix: licenseKeyId should be nullable
ALTER TABLE "User" ALTER COLUMN "licenseKeyId" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "licenseKeyId" DROP DEFAULT;
