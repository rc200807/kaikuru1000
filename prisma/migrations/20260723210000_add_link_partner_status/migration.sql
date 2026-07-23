-- 連携パートナーの対応ステータス機能
-- LinkPartnerStatus（パートナーごとの選択肢・問い合わせ用/顧客用で別セット）
-- LinkPartnerRecordStatus（問い合わせ/顧客への現在ステータス付与）
-- LinkPartnerActivityLog に detail 列を追加（変更履歴の可読説明）

-- AlterTable
ALTER TABLE "LinkPartnerActivityLog" ADD COLUMN "detail" TEXT;

-- CreateTable
CREATE TABLE "LinkPartnerStatus" (
    "id" TEXT NOT NULL,
    "linkPartnerId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkPartnerStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPartnerRecordStatus" (
    "id" TEXT NOT NULL,
    "linkPartnerId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "statusId" TEXT,
    "updatedByMemberId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkPartnerRecordStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkPartnerStatus_linkPartnerId_targetType_idx" ON "LinkPartnerStatus"("linkPartnerId", "targetType");

-- CreateIndex
CREATE UNIQUE INDEX "LinkPartnerRecordStatus_linkPartnerId_targetType_targetId_key" ON "LinkPartnerRecordStatus"("linkPartnerId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "LinkPartnerRecordStatus_linkPartnerId_targetType_idx" ON "LinkPartnerRecordStatus"("linkPartnerId", "targetType");

-- CreateIndex
CREATE INDEX "LinkPartnerRecordStatus_statusId_idx" ON "LinkPartnerRecordStatus"("statusId");

-- AddForeignKey
ALTER TABLE "LinkPartnerStatus" ADD CONSTRAINT "LinkPartnerStatus_linkPartnerId_fkey" FOREIGN KEY ("linkPartnerId") REFERENCES "LinkPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPartnerRecordStatus" ADD CONSTRAINT "LinkPartnerRecordStatus_linkPartnerId_fkey" FOREIGN KEY ("linkPartnerId") REFERENCES "LinkPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPartnerRecordStatus" ADD CONSTRAINT "LinkPartnerRecordStatus_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "LinkPartnerStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
