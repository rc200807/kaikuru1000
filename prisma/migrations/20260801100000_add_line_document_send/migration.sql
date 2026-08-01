-- 売買契約書・見積書のLINE送付（QR連携→自動送付）

-- AlterTable: LineLinkToken に用途と対象訪問を追加
ALTER TABLE "LineLinkToken" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'register';
ALTER TABLE "LineLinkToken" ADD COLUMN "visitScheduleId" TEXT;

-- AlterTable: LINE送付日時を記録（emailSentAt と対称）
ALTER TABLE "SalesContract" ADD COLUMN "lineSentAt" TIMESTAMP(3);
ALTER TABLE "Estimate" ADD COLUMN "lineSentAt" TIMESTAMP(3);
