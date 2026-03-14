-- 顧客タイプ + 振込先口座情報フィールドをUserに追加
ALTER TABLE "User" ADD COLUMN "customerType"  TEXT NOT NULL DEFAULT 'visit';
ALTER TABLE "User" ADD COLUMN "bankName"      TEXT;
ALTER TABLE "User" ADD COLUMN "branchName"    TEXT;
ALTER TABLE "User" ADD COLUMN "accountType"   TEXT;
ALTER TABLE "User" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "accountHolder" TEXT;

-- 宅配買取送付履歴テーブル
CREATE TABLE "DeliveryShipment" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "shipmentMonth"  TEXT NOT NULL,
    "description"    TEXT,
    "imageUrls"      TEXT NOT NULL DEFAULT '[]',
    "purchaseAmount" INTEGER,
    "status"         TEXT NOT NULL DEFAULT 'registered',
    "storeNote"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryShipment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeliveryShipment"
    ADD CONSTRAINT "DeliveryShipment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DeliveryShipment_shipmentNumber_key" ON "DeliveryShipment"("shipmentNumber");
CREATE INDEX "DeliveryShipment_userId_idx"        ON "DeliveryShipment"("userId");
CREATE INDEX "DeliveryShipment_shipmentMonth_idx" ON "DeliveryShipment"("shipmentMonth");
