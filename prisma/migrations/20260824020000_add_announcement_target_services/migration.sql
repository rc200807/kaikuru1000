-- お知らせの配信対象（対応サービスで絞り込む）。'[]' = 全店舗
ALTER TABLE "Announcement" ADD COLUMN "targetServices" TEXT NOT NULL DEFAULT '[]';
