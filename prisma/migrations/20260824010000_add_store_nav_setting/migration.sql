-- 店舗ポータルのサイドメニュー設定（並び順・表示/非表示）
CREATE TABLE "StoreNavSetting" (
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreNavSetting_pkey" PRIMARY KEY ("key")
);

-- 店舗ごとの特例（共通設定より優先）
CREATE TABLE "StoreNavOverride" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "showAll" BOOLEAN NOT NULL DEFAULT false,
    "items" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreNavOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreNavOverride_storeId_key" ON "StoreNavOverride"("storeId");

ALTER TABLE "StoreNavOverride" ADD CONSTRAINT "StoreNavOverride_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
