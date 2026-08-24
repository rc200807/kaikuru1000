-- 最終訪問日（CSVインポートで他システムから引き継いだ実績。訪問レコードを持たない顧客用）
ALTER TABLE "User" ADD COLUMN "lastVisitedAt" TIMESTAMP(3);
