-- 買取品目: 追加依頼品タグと備考
ALTER TABLE "PurchaseItem" ADD COLUMN "isAdditionalRequest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseItem" ADD COLUMN "notes" TEXT;

-- 請求項目（作業品目）: 備考
ALTER TABLE "WorkItem" ADD COLUMN "notes" TEXT;
