-- 顧客統合（吸収された顧客の統合先と日時）
ALTER TABLE "User" ADD COLUMN "mergedIntoUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "mergedAt" TIMESTAMP(3);
