-- 空き家管理記録の顧客向けレポート（トークンURL発行＋メール送信）

-- AlterTable
ALTER TABLE "AkiyaRecord" ADD COLUMN "reportToken" TEXT;
ALTER TABLE "AkiyaRecord" ADD COLUMN "reportSubmittedAt" TIMESTAMP(3);
ALTER TABLE "AkiyaRecord" ADD COLUMN "reportSentTo" TEXT;
ALTER TABLE "AkiyaRecord" ADD COLUMN "reportSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "AkiyaRecord_reportToken_key" ON "AkiyaRecord"("reportToken");
