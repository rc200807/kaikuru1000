-- 訪問スケジュールをGoogleカレンダーに登録する際に何を共有するかの設定。
-- 既定値はすべてtrue（変更前の挙動と同じ）にし、管理ポータルで編集するまで動作は変わらない。
ALTER TABLE "SiteConfig" ADD COLUMN "calendarShareAddress" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteConfig" ADD COLUMN "calendarShareVisitNote" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteConfig" ADD COLUMN "calendarShareDealDetail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteConfig" ADD COLUMN "calendarShareInternalNote" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteConfig" ADD COLUMN "calendarShareLinks" BOOLEAN NOT NULL DEFAULT true;
