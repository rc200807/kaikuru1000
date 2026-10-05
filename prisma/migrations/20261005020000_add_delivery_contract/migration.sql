-- 宅配買取の買取品目（PurchaseItem を送付に紐づける）
ALTER TABLE "PurchaseItem" ADD COLUMN "deliveryShipmentId" TEXT;
CREATE INDEX "PurchaseItem_deliveryShipmentId_createdAt_idx" ON "PurchaseItem"("deliveryShipmentId", "createdAt");
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_deliveryShipmentId_fkey" FOREIGN KEY ("deliveryShipmentId") REFERENCES "DeliveryShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 宅配買取の売買契約書（署名なし・店舗が発行）
CREATE TABLE "DeliveryContract" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "storeId" TEXT,
    "contractNo" TEXT NOT NULL,
    "purchaseAmount" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "pdfBase64" TEXT,
    "customerEmail" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "issuedByName" TEXT,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryContract_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryContract_shipmentId_key" ON "DeliveryContract"("shipmentId");
CREATE UNIQUE INDEX "DeliveryContract_contractNo_key" ON "DeliveryContract"("contractNo");
CREATE INDEX "DeliveryContract_storeId_agreedAt_idx" ON "DeliveryContract"("storeId", "agreedAt");
ALTER TABLE "DeliveryContract" ADD CONSTRAINT "DeliveryContract_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "DeliveryShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
