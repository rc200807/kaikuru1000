-- 店舗の住所を「店舗住所」と「メイン倉庫住所」の2種類に分割する。
-- 既存の address / postalCode はそのまま「店舗住所」として使い、倉庫用の列を追加する。
ALTER TABLE "Store" ADD COLUMN     "warehousePostalCode" TEXT;
ALTER TABLE "Store" ADD COLUMN     "warehouseAddress" TEXT;
