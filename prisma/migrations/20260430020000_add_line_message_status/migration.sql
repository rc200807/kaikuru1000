-- Add status field to LineMessage for tracking send success/failure
ALTER TABLE "LineMessage" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'sent';
