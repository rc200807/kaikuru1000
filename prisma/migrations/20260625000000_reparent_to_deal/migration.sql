-- 買取品目・請求項目・売買契約書・見積を「訪問」から「案件(Deal)」へ再ペアレント（追加方式・無停止）。
-- visitScheduleId は後方互換のため残し任意化。新しい正は dealId。

-- 1) dealId カラム追加（4モデル）＋ Deal に合計・事前同意カラム追加（すべて nullable）
ALTER TABLE "PurchaseItem"  ADD COLUMN "dealId" TEXT;
ALTER TABLE "WorkItem"      ADD COLUMN "dealId" TEXT;
ALTER TABLE "SalesContract" ADD COLUMN "dealId" TEXT;
ALTER TABLE "Estimate"      ADD COLUMN "dealId" TEXT;

ALTER TABLE "Deal" ADD COLUMN "purchaseAmount" INTEGER;
ALTER TABLE "Deal" ADD COLUMN "billingAmount" INTEGER;
ALTER TABLE "Deal" ADD COLUMN "preConsentSignature" TEXT;
ALTER TABLE "Deal" ADD COLUMN "preConsentAt" TIMESTAMP(3);

-- 2) visitScheduleId を任意化し、visit FK を ON DELETE CASCADE → SET NULL に貼り替え
--    （訪問を削除しても案件配下の品目・書類を消さない）
ALTER TABLE "PurchaseItem"  DROP CONSTRAINT "PurchaseItem_visitScheduleId_fkey";
ALTER TABLE "PurchaseItem"  ALTER COLUMN "visitScheduleId" DROP NOT NULL;
ALTER TABLE "PurchaseItem"  ADD CONSTRAINT "PurchaseItem_visitScheduleId_fkey" FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkItem"      DROP CONSTRAINT "WorkItem_visitScheduleId_fkey";
ALTER TABLE "WorkItem"      ALTER COLUMN "visitScheduleId" DROP NOT NULL;
ALTER TABLE "WorkItem"      ADD CONSTRAINT "WorkItem_visitScheduleId_fkey" FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesContract" DROP CONSTRAINT "SalesContract_visitScheduleId_fkey";
ALTER TABLE "SalesContract" ALTER COLUMN "visitScheduleId" DROP NOT NULL;
ALTER TABLE "SalesContract" ADD CONSTRAINT "SalesContract_visitScheduleId_fkey" FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Estimate"      DROP CONSTRAINT "Estimate_visitScheduleId_fkey";
ALTER TABLE "Estimate"      ALTER COLUMN "visitScheduleId" DROP NOT NULL;
ALTER TABLE "Estimate"      ADD CONSTRAINT "Estimate_visitScheduleId_fkey" FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) 品目のバックフィル：dealId = その訪問の dealId（全訪問は案件保有が保証済み）
UPDATE "PurchaseItem" pi SET "dealId" = vs."dealId" FROM "VisitSchedule" vs WHERE pi."visitScheduleId" = vs."id" AND pi."dealId" IS NULL;
UPDATE "WorkItem"     wi SET "dealId" = vs."dealId" FROM "VisitSchedule" vs WHERE wi."visitScheduleId" = vs."id" AND wi."dealId" IS NULL;

-- 4) 書類のバックフィル：案件ごとに最新1件のみ dealId を設定（1:1）。古い行は dealId=null のまま保持。
WITH ranked AS (
  SELECT sc."id" AS cid, vs."dealId" AS did,
         ROW_NUMBER() OVER (PARTITION BY vs."dealId" ORDER BY sc."agreedAt" DESC, sc."createdAt" DESC) AS rn
  FROM "SalesContract" sc
  JOIN "VisitSchedule" vs ON sc."visitScheduleId" = vs."id"
  WHERE vs."dealId" IS NOT NULL
)
UPDATE "SalesContract" sc SET "dealId" = r.did FROM ranked r WHERE sc."id" = r.cid AND r.rn = 1;

WITH ranked AS (
  SELECT e."id" AS eid, vs."dealId" AS did,
         ROW_NUMBER() OVER (PARTITION BY vs."dealId" ORDER BY e."createdAt" DESC) AS rn
  FROM "Estimate" e
  JOIN "VisitSchedule" vs ON e."visitScheduleId" = vs."id"
  WHERE vs."dealId" IS NOT NULL
)
UPDATE "Estimate" e SET "dealId" = r.did FROM ranked r WHERE e."id" = r.eid AND r.rn = 1;

-- 5) Deal 合計金額 ＝ 案件配下品目の合計、事前同意 ＝ 署名のある最新訪問から移送
UPDATE "Deal" d SET "purchaseAmount" = COALESCE((SELECT SUM(pi."purchasePrice" * pi."quantity") FROM "PurchaseItem" pi WHERE pi."dealId" = d."id"), 0);
UPDATE "Deal" d SET "billingAmount"  = COALESCE((SELECT SUM(wi."unitPrice" * wi."quantity") FROM "WorkItem" wi WHERE wi."dealId" = d."id"), 0);

WITH ranked AS (
  SELECT vs."dealId" AS did, vs."preConsentSignature" AS sig, vs."preConsentAt" AS at,
         ROW_NUMBER() OVER (PARTITION BY vs."dealId" ORDER BY vs."preConsentAt" DESC NULLS LAST) AS rn
  FROM "VisitSchedule" vs
  WHERE vs."preConsentSignature" IS NOT NULL AND vs."dealId" IS NOT NULL
)
UPDATE "Deal" d SET "preConsentSignature" = r.sig, "preConsentAt" = r.at FROM ranked r WHERE d."id" = r.did AND r.rn = 1;

-- 6) インデックス（バックフィル後＝重複なしなので unique 作成は失敗しない）
CREATE INDEX "PurchaseItem_dealId_idx" ON "PurchaseItem"("dealId");
CREATE INDEX "WorkItem_dealId_idx" ON "WorkItem"("dealId");
CREATE UNIQUE INDEX "SalesContract_dealId_key" ON "SalesContract"("dealId");
CREATE UNIQUE INDEX "Estimate_dealId_key" ON "Estimate"("dealId");

-- 7) dealId 外部キー（案件削除時は従属を Cascade。案件削除は訪問ありでアプリ層がブロック済み）
ALTER TABLE "PurchaseItem"  ADD CONSTRAINT "PurchaseItem_dealId_fkey"  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkItem"      ADD CONSTRAINT "WorkItem_dealId_fkey"      FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesContract" ADD CONSTRAINT "SalesContract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Estimate"      ADD CONSTRAINT "Estimate_dealId_fkey"      FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
