-- 案件番号（例: 20260824001 = 案件発生日(JST)の yyyyMMdd + その日の連番3桁）
-- 既存案件のバックフィルはアプリ側で行う（案件を開いた時の自動採番、または
-- 管理ポータルの /api/admin/deals/backfill-numbers）。
-- ここで複雑なSQLを実行して失敗すると migrate deploy が止まり全デプロイがロックするため、
-- マイグレーションは列とインデックスの追加だけに留める。
ALTER TABLE "Deal" ADD COLUMN "dealNumber" TEXT;

CREATE UNIQUE INDEX "Deal_dealNumber_key" ON "Deal"("dealNumber");
