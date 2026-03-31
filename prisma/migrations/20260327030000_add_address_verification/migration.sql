-- AlterTable
ALTER TABLE "User" ADD COLUMN "addressVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "addressMismatch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "proofDocumentPath" TEXT;
ALTER TABLE "User" ADD COLUMN "proofDocumentType" TEXT;
ALTER TABLE "User" ADD COLUMN "proofDocumentStatus" TEXT;
