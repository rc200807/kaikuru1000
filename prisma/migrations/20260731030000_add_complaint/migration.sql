-- クレーム対応記録
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeOwnership" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "primaryHandlerId" TEXT,
    "secondaryHandlerId" TEXT,
    "finalHandlerId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Complaint_storeId_idx" ON "Complaint"("storeId");
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");
CREATE INDEX "Complaint_occurredOn_idx" ON "Complaint"("occurredOn");

ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_primaryHandlerId_fkey"
  FOREIGN KEY ("primaryHandlerId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_secondaryHandlerId_fkey"
  FOREIGN KEY ("secondaryHandlerId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_finalHandlerId_fkey"
  FOREIGN KEY ("finalHandlerId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
