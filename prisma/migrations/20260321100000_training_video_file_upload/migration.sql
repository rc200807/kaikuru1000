-- Rename youtubeUrl to videoUrl
ALTER TABLE "TrainingVideo" RENAME COLUMN "youtubeUrl" TO "videoUrl";

-- Add new columns for file upload
ALTER TABLE "TrainingVideo" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "TrainingVideo" ADD COLUMN "fileSize" INTEGER;
