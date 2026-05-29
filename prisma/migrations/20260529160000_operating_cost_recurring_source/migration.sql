-- 運用コストに「定期（毎月固定費）」フラグと「取得元（手動/Stripe自動）」を追加
-- AlterTable
ALTER TABLE "OperatingCost" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OperatingCost" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
