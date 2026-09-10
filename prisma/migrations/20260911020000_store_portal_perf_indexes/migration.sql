-- 店舗ポータルの一覧・詳細のホットパスに効くインデックスをまとめて追加する。
--
-- 注意: PostgreSQL の CREATE INDEX は対象テーブルの書き込みを一時的にブロックする。
-- Prisma はマイグレーションをトランザクションで包むため CREATE INDEX CONCURRENTLY は
-- ここでは使えない（エラーになる）。現状の行数なら1テーブルあたり1秒未満で完了する想定。
-- 将来テーブルが大きくなった場合は CONCURRENTLY をマイグレーション外で手動実行すること。
-- （20260824070000_add_performance_indexes と同じ方針）

-- 古物台帳（agreedAt の期間指定＋降順で take 500〜2000）・管理ダッシュボード・
-- 売上/案件分析がすべてここを叩くが、SalesContract は明示インデックスが1本も無く
-- dealId / visitScheduleId の unique しか持っていなかった。
CREATE INDEX IF NOT EXISTS "SalesContract_agreedAt_idx" ON "SalesContract"("agreedAt");

-- 案件一覧の既定ソートは occurredAt（deal-list-query.ts の DEFAULT_ORDER）。
-- 店舗ダッシュボードの「直近の案件」も occurredAt desc なので、
-- 既存の (storeId, createdAt) では並べ替えに効かない。
CREATE INDEX IF NOT EXISTS "Deal_storeId_occurredAt_idx" ON "Deal"("storeId", "occurredAt");

-- 買取品目は必ず「親（案件 or 訪問）配下を createdAt 順」で読む
-- （案件詳細GET・買取品目一覧・書類作成のいずれも orderBy: createdAt）。
CREATE INDEX IF NOT EXISTS "PurchaseItem_dealId_createdAt_idx"
  ON "PurchaseItem"("dealId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseItem_visitScheduleId_createdAt_idx"
  ON "PurchaseItem"("visitScheduleId", "createdAt");
-- 上の複合が先頭列として完全に含むため、単独列インデックスは冗長（書き込みコストのみ）
DROP INDEX IF EXISTS "PurchaseItem_dealId_idx";
DROP INDEX IF EXISTS "PurchaseItem_visitScheduleId_idx";

-- 在庫一覧（where storeId + orderBy updatedAt desc + take）
CREATE INDEX IF NOT EXISTS "InventoryItem_storeId_updatedAt_idx"
  ON "InventoryItem"("storeId", "updatedAt");

-- 宅配一覧（user 経由で店舗を絞り shipmentMonth desc, createdAt desc で並べる）
CREATE INDEX IF NOT EXISTS "DeliveryShipment_userId_shipmentMonth_idx"
  ON "DeliveryShipment"("userId", "shipmentMonth");
-- 上の複合が先頭列として含むので単独列は冗長
DROP INDEX IF EXISTS "DeliveryShipment_userId_idx";

-- 問い合わせ一覧のステータス絞り込み（既存の (storeId, createdAt) は status 指定時に効かない）
CREATE INDEX IF NOT EXISTS "Inquiry_storeId_status_createdAt_idx"
  ON "Inquiry"("storeId", "status", "createdAt");

-- 案件詳細の会話録音一覧（dealId で絞り createdAt 降順）
CREATE INDEX IF NOT EXISTS "DealRecording_dealId_createdAt_idx"
  ON "DealRecording"("dealId", "createdAt");
DROP INDEX IF EXISTS "DealRecording_dealId_idx";
