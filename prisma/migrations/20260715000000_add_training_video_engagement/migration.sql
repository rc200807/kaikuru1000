-- 研修動画のいいね（Good）・コメント・お気に入り

-- CreateTable
CREATE TABLE "TrainingVideoLike" (
    "id" TEXT NOT NULL,
    "trainingVideoId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingVideoLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingVideoComment" (
    "id" TEXT NOT NULL,
    "trainingVideoId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "storeId" TEXT,
    "memberId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingVideoComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingVideoFavorite" (
    "id" TEXT NOT NULL,
    "trainingVideoId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingVideoFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingVideoLike_trainingVideoId_storeId_key" ON "TrainingVideoLike"("trainingVideoId", "storeId");
CREATE INDEX "TrainingVideoLike_trainingVideoId_idx" ON "TrainingVideoLike"("trainingVideoId");
CREATE INDEX "TrainingVideoComment_trainingVideoId_idx" ON "TrainingVideoComment"("trainingVideoId");
CREATE UNIQUE INDEX "TrainingVideoFavorite_trainingVideoId_storeId_key" ON "TrainingVideoFavorite"("trainingVideoId", "storeId");
CREATE INDEX "TrainingVideoFavorite_trainingVideoId_idx" ON "TrainingVideoFavorite"("trainingVideoId");
CREATE INDEX "TrainingVideoFavorite_storeId_idx" ON "TrainingVideoFavorite"("storeId");

-- AddForeignKey
ALTER TABLE "TrainingVideoLike" ADD CONSTRAINT "TrainingVideoLike_trainingVideoId_fkey" FOREIGN KEY ("trainingVideoId") REFERENCES "TrainingVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingVideoComment" ADD CONSTRAINT "TrainingVideoComment_trainingVideoId_fkey" FOREIGN KEY ("trainingVideoId") REFERENCES "TrainingVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingVideoFavorite" ADD CONSTRAINT "TrainingVideoFavorite_trainingVideoId_fkey" FOREIGN KEY ("trainingVideoId") REFERENCES "TrainingVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
