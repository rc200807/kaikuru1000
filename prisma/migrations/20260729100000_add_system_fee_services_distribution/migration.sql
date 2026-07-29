-- システム利用料のサービス連動化と分配
-- 1) 料金項目マスタ SystemFeeService（対応サービスごとの月額）
-- 2) StorePayment に内訳・分配ステータス
-- 3) RevenueTransfer を店舗決済の分配にも使えるよう汎用化

-- CreateTable
CREATE TABLE "SystemFeeService" (
    "id" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFeeService_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SystemFeeService_serviceKey_key" ON "SystemFeeService"("serviceKey");

-- AlterTable: StorePayment に内訳・分配ステータス
ALTER TABLE "StorePayment" ADD COLUMN "breakdownJson" TEXT;
ALTER TABLE "StorePayment" ADD COLUMN "distributionStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "StorePayment" ADD COLUMN "distributionError" TEXT;
ALTER TABLE "StorePayment" ADD COLUMN "distributedAt" TIMESTAMP(3);

-- AlterTable: RevenueTransfer の汎用化（akikuruInvoiceId を任意に・storePaymentId を追加）
ALTER TABLE "RevenueTransfer" ALTER COLUMN "akikuruInvoiceId" DROP NOT NULL;
ALTER TABLE "RevenueTransfer" ADD COLUMN "storePaymentId" TEXT;
ALTER TABLE "RevenueTransfer" ADD CONSTRAINT "RevenueTransfer_storePaymentId_fkey" FOREIGN KEY ("storePaymentId") REFERENCES "StorePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "RevenueTransfer_storePaymentId_idx" ON "RevenueTransfer"("storePaymentId");
