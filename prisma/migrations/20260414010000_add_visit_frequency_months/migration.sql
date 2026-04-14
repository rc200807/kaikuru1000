-- Add visitFrequencyMonths: 訪問・宅配の頻度（何ヶ月に1回）
ALTER TABLE "User" ADD COLUMN "visitFrequencyMonths" INTEGER NOT NULL DEFAULT 1;
