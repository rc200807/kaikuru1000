-- 顧客に訪問先の郵便番号を追加（公開フォームでの住所自動補完に使用）
ALTER TABLE "User" ADD COLUMN "postalCode" TEXT;
