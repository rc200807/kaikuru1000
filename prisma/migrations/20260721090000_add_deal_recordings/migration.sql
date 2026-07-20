-- CreateTable
CREATE TABLE "DealRecording" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transcript" TEXT,
    "summary" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "uploadedByType" TEXT,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealRecording_dealId_idx" ON "DealRecording"("dealId");

-- CreateIndex
CREATE INDEX "DealRecording_status_idx" ON "DealRecording"("status");

-- AddForeignKey
ALTER TABLE "DealRecording" ADD CONSTRAINT "DealRecording_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
