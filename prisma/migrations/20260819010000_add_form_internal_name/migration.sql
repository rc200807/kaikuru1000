-- 管理用の名前（公開タイトルとは別に管理画面でだけ使う）
ALTER TABLE "Form" ADD COLUMN "internalName" TEXT;
