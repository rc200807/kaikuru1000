-- Add storeId to LineChannel for store association
ALTER TABLE "LineChannel" ADD COLUMN "storeId" TEXT;

-- CreateIndex
CREATE INDEX "LineChannel_storeId_idx" ON "LineChannel"("storeId");

-- AddForeignKey
ALTER TABLE "LineChannel" ADD CONSTRAINT "LineChannel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
