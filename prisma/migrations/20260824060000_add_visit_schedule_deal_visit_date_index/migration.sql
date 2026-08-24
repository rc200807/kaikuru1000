-- 案件一覧の「訪問予定」フィルタ（visitSchedules の EXISTS）を効かせるための複合インデックス
CREATE INDEX "VisitSchedule_dealId_visitDate_idx" ON "VisitSchedule"("dealId", "visitDate");
