-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN "janCode" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "rakutenData" TEXT;

-- AlterTable
ALTER TABLE "SiteConfig" ADD COLUMN "rakutenAppId" TEXT;
