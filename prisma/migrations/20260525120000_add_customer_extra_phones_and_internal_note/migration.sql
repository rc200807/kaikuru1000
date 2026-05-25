-- Customer 拡張: 追加電話番号2つ + 店舗/管理者向け内部メモ
ALTER TABLE "User" ADD COLUMN "phone2" TEXT;
ALTER TABLE "User" ADD COLUMN "phone3" TEXT;
ALTER TABLE "User" ADD COLUMN "internalNote" TEXT;
