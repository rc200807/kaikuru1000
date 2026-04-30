-- Add inquiryId column to PurchaseMemo for inquiry association
ALTER TABLE "PurchaseMemo" ADD COLUMN "inquiryId" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseMemo_inquiryId_idx" ON "PurchaseMemo"("inquiryId");

-- AddForeignKey
ALTER TABLE "PurchaseMemo" ADD CONSTRAINT "PurchaseMemo_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
