-- 研修動画の店舗別視聴ステータス
CREATE TABLE "TrainingVideoView" (
  "id"              TEXT NOT NULL,
  "trainingVideoId" TEXT NOT NULL,
  "storeId"         TEXT NOT NULL,
  "playCount"       INTEGER NOT NULL DEFAULT 0,
  "firstViewedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TrainingVideoView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingVideoView_trainingVideoId_storeId_key" ON "TrainingVideoView"("trainingVideoId", "storeId");
CREATE INDEX "TrainingVideoView_storeId_idx" ON "TrainingVideoView"("storeId");
CREATE INDEX "TrainingVideoView_trainingVideoId_idx" ON "TrainingVideoView"("trainingVideoId");

ALTER TABLE "TrainingVideoView" ADD CONSTRAINT "TrainingVideoView_trainingVideoId_fkey"
  FOREIGN KEY ("trainingVideoId") REFERENCES "TrainingVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingVideoView" ADD CONSTRAINT "TrainingVideoView_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
