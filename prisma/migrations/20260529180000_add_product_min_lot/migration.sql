-- 備品の最低発注数（最低ロット）
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "minLot" INTEGER NOT NULL DEFAULT 1;
