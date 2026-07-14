-- 買取金額の上乗せ率（0/10/15%）
ALTER TABLE "Deal" ADD COLUMN "purchaseUpliftPercent" INTEGER NOT NULL DEFAULT 0;
