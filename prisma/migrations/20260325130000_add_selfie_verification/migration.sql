-- AlterTable
ALTER TABLE "User" ADD COLUMN "selfieImagePath" TEXT;
ALTER TABLE "User" ADD COLUMN "faceVerificationResult" TEXT;
ALTER TABLE "User" ADD COLUMN "faceVerificationAt" TIMESTAMP(3);
