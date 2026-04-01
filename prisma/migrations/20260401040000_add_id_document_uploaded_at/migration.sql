-- Add idDocumentUploadedAt for auto-cleanup tracking
ALTER TABLE "User" ADD COLUMN "idDocumentUploadedAt" TIMESTAMP(3);

-- Set existing documents' upload date to now (they won't be auto-deleted for 4 days)
UPDATE "User" SET "idDocumentUploadedAt" = NOW() WHERE "idDocumentPath" IS NOT NULL;
