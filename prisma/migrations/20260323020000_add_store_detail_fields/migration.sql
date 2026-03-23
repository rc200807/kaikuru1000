-- AlterTable
ALTER TABLE "Store" ADD COLUMN "storeStatus" TEXT DEFAULT 'active';
ALTER TABLE "Store" ADD COLUMN "openingDate" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN "closingDate" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN "googleBusinessUrl" TEXT;
ALTER TABLE "Store" ADD COLUMN "oikuraPageUrl" TEXT;
ALTER TABLE "Store" ADD COLUMN "bankInfo" TEXT;
ALTER TABLE "Store" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Store" ADD COLUMN "antiquePermitNumber" TEXT;
