-- テスト店舗フラグ（統計から除外する動作確認用の店舗）
ALTER TABLE "Store" ADD COLUMN "isTestStore" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Store_isTestStore_idx" ON "Store"("isTestStore");

-- 店舗メニュー設定：テスト店舗限定表示
ALTER TABLE "StoreNavSetting" ADD COLUMN "testStoreOnly" BOOLEAN NOT NULL DEFAULT false;
