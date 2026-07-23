-- 連携パートナーポータル（外部連携パートナー向け・SalesPartnerとは別系統）
-- 5テーブル: LinkPartner / LinkPartnerMember / LinkPartnerForm / LinkPartnerInvitation / LinkPartnerActivityLog
-- Form / Admin 本体はカラム変更なし（back-relation のみ = DDL不要）

-- CreateTable
CREATE TABLE "LinkPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "invitedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPartnerMember" (
    "id" TEXT NOT NULL,
    "linkPartnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "invitedByMemberId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkPartnerMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPartnerForm" (
    "id" TEXT NOT NULL,
    "linkPartnerId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "assignedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkPartnerForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPartnerInvitation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "linkPartnerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invitedByMemberId" TEXT,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkPartnerInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPartnerActivityLog" (
    "id" TEXT NOT NULL,
    "linkPartnerId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkPartnerActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkPartnerMember_email_key" ON "LinkPartnerMember"("email");

-- CreateIndex
CREATE INDEX "LinkPartnerMember_linkPartnerId_idx" ON "LinkPartnerMember"("linkPartnerId");

-- CreateIndex
CREATE INDEX "LinkPartnerMember_role_idx" ON "LinkPartnerMember"("role");

-- CreateIndex
CREATE UNIQUE INDEX "LinkPartnerForm_linkPartnerId_formId_key" ON "LinkPartnerForm"("linkPartnerId", "formId");

-- CreateIndex
CREATE INDEX "LinkPartnerForm_formId_idx" ON "LinkPartnerForm"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkPartnerInvitation_token_key" ON "LinkPartnerInvitation"("token");

-- CreateIndex
CREATE INDEX "LinkPartnerInvitation_email_idx" ON "LinkPartnerInvitation"("email");

-- CreateIndex
CREATE INDEX "LinkPartnerInvitation_linkPartnerId_idx" ON "LinkPartnerInvitation"("linkPartnerId");

-- CreateIndex
CREATE INDEX "LinkPartnerActivityLog_linkPartnerId_createdAt_idx" ON "LinkPartnerActivityLog"("linkPartnerId", "createdAt");

-- CreateIndex
CREATE INDEX "LinkPartnerActivityLog_memberId_idx" ON "LinkPartnerActivityLog"("memberId");

-- CreateIndex
CREATE INDEX "LinkPartnerActivityLog_action_idx" ON "LinkPartnerActivityLog"("action");

-- AddForeignKey
ALTER TABLE "LinkPartner" ADD CONSTRAINT "LinkPartner_invitedByAdminId_fkey" FOREIGN KEY ("invitedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPartnerMember" ADD CONSTRAINT "LinkPartnerMember_linkPartnerId_fkey" FOREIGN KEY ("linkPartnerId") REFERENCES "LinkPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPartnerForm" ADD CONSTRAINT "LinkPartnerForm_linkPartnerId_fkey" FOREIGN KEY ("linkPartnerId") REFERENCES "LinkPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPartnerForm" ADD CONSTRAINT "LinkPartnerForm_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPartnerInvitation" ADD CONSTRAINT "LinkPartnerInvitation_linkPartnerId_fkey" FOREIGN KEY ("linkPartnerId") REFERENCES "LinkPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPartnerActivityLog" ADD CONSTRAINT "LinkPartnerActivityLog_linkPartnerId_fkey" FOREIGN KEY ("linkPartnerId") REFERENCES "LinkPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
