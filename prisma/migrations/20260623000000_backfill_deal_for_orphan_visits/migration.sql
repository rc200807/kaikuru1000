-- 案件未割当（dealId IS NULL）の訪問に、訪問1件＝案件1件で案件を生成して割り当てる（バックフィル・データのみ）。
-- 目的: 売買契約書/見積が「どの案件からも辿れない」状態を解消し、全訪問が案件に属する不変条件を満たす。
-- スキーマ変更なし。再実行は dealId IS NULL ガードにより安全。

-- 1) 孤立訪問ごとに新しい案件IDと導出ステータスを確定（契約あり→contract / 見積あり→estimate_only / 完了→completed / それ以外→visit_decided）
CREATE TEMP TABLE "_deal_backfill" AS
SELECT
  gen_random_uuid()::text AS deal_id,
  vs."id"      AS visit_id,
  vs."userId"  AS user_id,
  vs."storeId" AS store_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM "SalesContract" sc WHERE sc."visitScheduleId" = vs."id") THEN 'contract'
    WHEN EXISTS (SELECT 1 FROM "Estimate" e WHERE e."visitScheduleId" = vs."id") THEN 'estimate_only'
    WHEN vs."status" = 'completed' THEN 'completed'
    ELSE 'visit_decided'
  END AS status
FROM "VisitSchedule" vs
WHERE vs."dealId" IS NULL;

-- 2) 案件を作成
INSERT INTO "Deal" ("id", "userId", "storeId", "inquiryId", "detail", "status", "createdAt", "updatedAt")
SELECT deal_id, user_id, store_id, NULL, NULL, status, NOW(), NOW()
FROM "_deal_backfill";

-- 3) 訪問に案件を割り当て
UPDATE "VisitSchedule" vs
SET "dealId" = b.deal_id
FROM "_deal_backfill" b
WHERE vs."id" = b.visit_id;

DROP TABLE "_deal_backfill";
