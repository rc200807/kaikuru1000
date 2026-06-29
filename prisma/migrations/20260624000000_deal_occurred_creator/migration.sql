-- 案件（Deal）に「案件発生日」と「作成者スナップショット」を追加（追加のみ・低リスク）。

-- 案件発生日: NOT NULL DEFAULT で誕生させ null 不在にする（SET NOT NULL 不要＝P3009 回避）
ALTER TABLE "Deal" ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- 既存案件の発生日は作成日で初期化
UPDATE "Deal" SET "occurredAt" = "createdAt";

-- 作成者スナップショット（polymorphic: BugReportComment / AccessLog と同様の方式）
ALTER TABLE "Deal" ADD COLUMN "createdByType" TEXT;
ALTER TABLE "Deal" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Deal" ADD COLUMN "createdByName" TEXT;
