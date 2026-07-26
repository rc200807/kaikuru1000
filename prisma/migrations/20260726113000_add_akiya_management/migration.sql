-- 空き家管理案件（アキクル対応店舗の定期管理代行サービス）
-- AkiyaCase（案件）/ AkiyaRecord（管理記録）/ AkiyaRecordItem（記録×項目明細）/ AkiyaManagementItem（管理項目マスタ）

-- CreateTable
CREATE TABLE "AkiyaCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "status" TEXT NOT NULL DEFAULT 'pre_contract',
    "photoUrls" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "lastVisitedAt" TIMESTAMP(3),
    "nextVisitAt" TIMESTAMP(3),
    "createdByType" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AkiyaCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AkiyaRecord" (
    "id" TEXT NOT NULL,
    "akiyaCaseId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "gpsAccuracy" DOUBLE PRECISION,
    "staffName" TEXT,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AkiyaRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AkiyaRecordItem" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "itemMasterId" TEXT,
    "itemName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "photoUrls" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AkiyaRecordItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AkiyaManagementItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AkiyaManagementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AkiyaCase_userId_idx" ON "AkiyaCase"("userId");

-- CreateIndex
CREATE INDEX "AkiyaCase_storeId_idx" ON "AkiyaCase"("storeId");

-- CreateIndex
CREATE INDEX "AkiyaCase_status_idx" ON "AkiyaCase"("status");

-- CreateIndex
CREATE INDEX "AkiyaCase_nextVisitAt_idx" ON "AkiyaCase"("nextVisitAt");

-- CreateIndex
CREATE INDEX "AkiyaRecord_akiyaCaseId_performedAt_idx" ON "AkiyaRecord"("akiyaCaseId", "performedAt");

-- CreateIndex
CREATE INDEX "AkiyaRecord_memberId_idx" ON "AkiyaRecord"("memberId");

-- CreateIndex
CREATE INDEX "AkiyaRecordItem_recordId_idx" ON "AkiyaRecordItem"("recordId");

-- CreateIndex
CREATE INDEX "AkiyaRecordItem_itemMasterId_idx" ON "AkiyaRecordItem"("itemMasterId");

-- CreateIndex
CREATE UNIQUE INDEX "AkiyaManagementItem_name_key" ON "AkiyaManagementItem"("name");

-- AddForeignKey
ALTER TABLE "AkiyaCase" ADD CONSTRAINT "AkiyaCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkiyaCase" ADD CONSTRAINT "AkiyaCase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkiyaCase" ADD CONSTRAINT "AkiyaCase_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "StoreMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkiyaRecord" ADD CONSTRAINT "AkiyaRecord_akiyaCaseId_fkey" FOREIGN KEY ("akiyaCaseId") REFERENCES "AkiyaCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkiyaRecord" ADD CONSTRAINT "AkiyaRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "StoreMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkiyaRecordItem" ADD CONSTRAINT "AkiyaRecordItem_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AkiyaRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkiyaRecordItem" ADD CONSTRAINT "AkiyaRecordItem_itemMasterId_fkey" FOREIGN KEY ("itemMasterId") REFERENCES "AkiyaManagementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
