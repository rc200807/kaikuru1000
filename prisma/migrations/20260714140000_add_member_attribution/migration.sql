-- 店舗メンバー帰属: 主要アクティビティに memberId (StoreMember FK) を追加
-- 過去データのバックフィルは行わない（名前文字列しか残っておらず同名衝突リスクがあるため。
-- 過去分は staffName / createdByName / userName によるハイブリッド照合で参考値として集計する）
ALTER TABLE "VisitSchedule" ADD COLUMN "memberId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "memberId" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "memberId" TEXT;
ALTER TABLE "AccessLog" ADD COLUMN "memberId" TEXT;

CREATE INDEX "VisitSchedule_memberId_idx" ON "VisitSchedule"("memberId");
CREATE INDEX "Deal_memberId_idx" ON "Deal"("memberId");
CREATE INDEX "Estimate_memberId_idx" ON "Estimate"("memberId");
CREATE INDEX "AccessLog_memberId_idx" ON "AccessLog"("memberId");
CREATE INDEX "AccessLog_userId_createdAt_idx" ON "AccessLog"("userId", "createdAt");

ALTER TABLE "VisitSchedule" ADD CONSTRAINT "VisitSchedule_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "StoreMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "StoreMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "StoreMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "StoreMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
