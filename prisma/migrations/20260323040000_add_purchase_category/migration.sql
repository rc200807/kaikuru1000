-- CreateTable
CREATE TABLE "PurchaseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseCategory_name_key" ON "PurchaseCategory"("name");

-- Add categoryId to PurchaseItem
ALTER TABLE "PurchaseItem" ADD COLUMN "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PurchaseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert default categories
INSERT INTO "PurchaseCategory" ("id", "name", "sortOrder", "createdAt", "updatedAt") VALUES
('cat_1000box', '1000円ボックス', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_bag', 'バッグ', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_watch', '時計', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_jewelry', '貴金属・ジュエリー', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_brand', 'ブランド品', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_electronics', '家電・電子機器', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_clothing', '衣類・アパレル', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_hobby', 'ホビー・コレクション', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_other', 'その他', 99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
