-- 職業・流入経路・補足確認書類・見積書・流入経路マスタの追加

-- AlterTable: User に 職業 / 流入経路 を追加
ALTER TABLE "User" ADD COLUMN "occupation" TEXT;
ALTER TABLE "User" ADD COLUMN "leadSource" TEXT;

-- AlterTable: VisitSchedule に 補足確認書類（JSON配列） を追加
ALTER TABLE "VisitSchedule" ADD COLUMN "supplementaryDocs" TEXT;

-- CreateTable: 流入経路マスタ
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_name_key" ON "LeadSource"("name");

-- CreateTable: 見積書
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "visitScheduleId" TEXT NOT NULL,
    "purchaseAmount" INTEGER NOT NULL,
    "billingAmount" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "staffName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "pdfBase64" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_visitScheduleId_key" ON "Estimate"("visitScheduleId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_visitScheduleId_fkey" FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 流入経路マスタの初期データ（電話 / お問い合わせフォーム / LINE / 紹介 / おいくら）
INSERT INTO "LeadSource" ("id", "name", "sortOrder", "createdAt", "updatedAt") VALUES
    ('leadsrc_phone', '電話', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('leadsrc_form', 'お問い合わせフォーム', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('leadsrc_line', 'LINE', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('leadsrc_referral', '紹介', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('leadsrc_oikura', 'おいくら', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
