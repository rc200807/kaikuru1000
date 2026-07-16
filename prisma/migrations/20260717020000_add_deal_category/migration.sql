-- 案件（Deal）カテゴリーを追加。purchase(買取)/akikuru(アキクル)/ecotoku(エコトク)
-- 既存案件は顧客種別からバックフィル:
--   顧客が akikuru → アキクル案件 / visit・delivery → エコトク案件 / それ以外 → 買取案件（既定）

ALTER TABLE "Deal" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'purchase';

-- アキクル顧客の案件 → アキクル案件
UPDATE "Deal" SET "category" = 'akikuru'
  FROM "User"
  WHERE "Deal"."userId" = "User"."id" AND "User"."customerType" = 'akikuru';

-- 訪問型・宅配型顧客の案件 → エコトク案件
UPDATE "Deal" SET "category" = 'ecotoku'
  FROM "User"
  WHERE "Deal"."userId" = "User"."id" AND "User"."customerType" IN ('visit', 'delivery');

-- それ以外は既定の 'purchase'（買取案件）のまま

-- CreateIndex
CREATE INDEX "Deal_category_idx" ON "Deal"("category");
