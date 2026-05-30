-- 在庫（InventoryItem）+ マーケットプレイス出品状態（MarketplaceListing）テーブルの追加
-- + 買取品目（PurchaseItem）からの変換元リンク（InventoryItem.sourcePurchaseItemId）

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourcePurchaseItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "categoryName" TEXT NOT NULL DEFAULT '',
    "brand" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'no_noticeable_damage',
    "costPrice" INTEGER NOT NULL,
    "listingPrice" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "managementCode" TEXT,
    "imageUrls" TEXT NOT NULL DEFAULT '[]',
    "janCode" TEXT,
    "weightGrams" INTEGER,
    "sizeW" INTEGER,
    "sizeH" INTEGER,
    "sizeD" INTEGER,
    "shippingPayer" TEXT NOT NULL DEFAULT 'seller',
    "shippingMethod" TEXT,
    "shippingFromPrefecture" TEXT,
    "shippingDays" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "listedAt" TIMESTAMP(3),
    "soldPrice" INTEGER,
    "soldAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "listingStatus" TEXT NOT NULL DEFAULT 'pending',
    "listedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "rawResponse" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sourcePurchaseItemId_key" ON "InventoryItem"("sourcePurchaseItemId");

-- CreateIndex
CREATE INDEX "InventoryItem_storeId_idx" ON "InventoryItem"("storeId");

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "InventoryItem"("status");

-- CreateIndex
CREATE INDEX "InventoryItem_storeId_status_idx" ON "InventoryItem"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_inventoryItemId_marketplace_key" ON "MarketplaceListing"("inventoryItemId", "marketplace");

-- CreateIndex
CREATE INDEX "MarketplaceListing_inventoryItemId_idx" ON "MarketplaceListing"("inventoryItemId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_marketplace_listingStatus_idx" ON "MarketplaceListing"("marketplace", "listingStatus");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sourcePurchaseItemId_fkey" FOREIGN KEY ("sourcePurchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
