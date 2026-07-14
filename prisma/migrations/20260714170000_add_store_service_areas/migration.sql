-- 店舗の対応エリア（都道府県＋市区町村の集合）を JSON 文字列で保持
ALTER TABLE "Store" ADD COLUMN "serviceAreas" TEXT DEFAULT '[]';
