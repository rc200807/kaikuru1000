-- 一覧・詳細画面のホットパスに効くインデックスをまとめて追加する。
-- 特に User はこれまでインデックスが1つも無く、店舗の顧客一覧が毎回テーブル全走査だった。
--
-- 注意: PostgreSQL の CREATE INDEX は対象テーブルの書き込みを一時的にブロックする。
-- 現状の行数（顧客・訪問予定とも数千〜数万規模）なら1テーブルあたり1秒未満で完了する想定。
-- 将来テーブルが大きくなった場合は、この方式ではなく CREATE INDEX CONCURRENTLY を
-- マイグレーション外（トランザクション外）で手動実行すること。

-- 顧客一覧: storeId で絞り、統合済み顧客を除外して名前順に並べる（最頻の形）
CREATE INDEX IF NOT EXISTS "User_storeId_mergedIntoUserId_name_idx" ON "User"("storeId", "mergedIntoUserId", "name");
-- 顧客一覧: 登録日の範囲指定・登録日順
CREATE INDEX IF NOT EXISTS "User_storeId_createdAt_idx" ON "User"("storeId", "createdAt");
-- 顧客一覧: 顧客タイプでの絞り込み
CREATE INDEX IF NOT EXISTS "User_storeId_customerType_idx" ON "User"("storeId", "customerType");
-- 「最終訪問」フィルタ（CSV取込で引き継いだ実績）
CREATE INDEX IF NOT EXISTS "User_lastVisitedAt_idx" ON "User"("lastVisitedAt");

-- スケジュール画面（期間表示）・店舗ダッシュボード
CREATE INDEX IF NOT EXISTS "VisitSchedule_storeId_visitDate_idx" ON "VisitSchedule"("storeId", "visitDate");
-- 顧客詳細の訪問一覧・最終訪問日の算出
CREATE INDEX IF NOT EXISTS "VisitSchedule_userId_visitDate_idx" ON "VisitSchedule"("userId", "visitDate");
-- 「今日の訪問」「未完了」など、ステータス＋日付の横断集計
CREATE INDEX IF NOT EXISTS "VisitSchedule_status_visitDate_idx" ON "VisitSchedule"("status", "visitDate");

-- 案件一覧の既定並び（新しい順）とステータス絞り込み
CREATE INDEX IF NOT EXISTS "Deal_storeId_createdAt_idx" ON "Deal"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Deal_storeId_status_idx" ON "Deal"("storeId", "status");

-- 問い合わせ一覧（新しい順）
CREATE INDEX IF NOT EXISTS "Inquiry_storeId_createdAt_idx" ON "Inquiry"("storeId", "createdAt");

-- 顧客ごとの買取希望品（新しい順）
CREATE INDEX IF NOT EXISTS "PurchaseMemo_userId_createdAt_idx" ON "PurchaseMemo"("userId", "createdAt");

-- ポータル別のアクセスログ一覧
CREATE INDEX IF NOT EXISTS "AccessLog_userType_createdAt_idx" ON "AccessLog"("userType", "createdAt");
