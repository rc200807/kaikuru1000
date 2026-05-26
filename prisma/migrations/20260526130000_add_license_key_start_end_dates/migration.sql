-- ライセンスキーに利用期間を追加
ALTER TABLE "LicenseKey" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "LicenseKey" ADD COLUMN "endDate" TIMESTAMP(3);
