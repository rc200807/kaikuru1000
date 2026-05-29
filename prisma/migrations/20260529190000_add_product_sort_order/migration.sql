-- 備品の表示順（ドラッグ＆ドロップ並べ替え用）
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
