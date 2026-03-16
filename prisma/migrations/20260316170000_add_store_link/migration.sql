CREATE TABLE "StoreLink" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "linkedStoreId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreLink_storeId_linkedStoreId_key" ON "StoreLink"("storeId", "linkedStoreId");
CREATE INDEX "StoreLink_storeId_idx" ON "StoreLink"("storeId");
CREATE INDEX "StoreLink_linkedStoreId_idx" ON "StoreLink"("linkedStoreId");

ALTER TABLE "StoreLink" ADD CONSTRAINT "StoreLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreLink" ADD CONSTRAINT "StoreLink_linkedStoreId_fkey" FOREIGN KEY ("linkedStoreId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
