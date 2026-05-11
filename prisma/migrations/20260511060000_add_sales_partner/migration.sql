-- セールスパートナー
CREATE TABLE "SalesPartner" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "password"    TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "invitedById" TEXT,
  "acceptedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesPartner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPartner_email_key" ON "SalesPartner"("email");

ALTER TABLE "SalesPartner" ADD CONSTRAINT "SalesPartner_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 招待リンク
CREATE TABLE "SalesPartnerInvitation" (
  "id"             TEXT NOT NULL,
  "token"          TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "name"           TEXT,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "usedAt"         TIMESTAMP(3),
  "createdById"    TEXT NOT NULL,
  "salesPartnerId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SalesPartnerInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPartnerInvitation_token_key" ON "SalesPartnerInvitation"("token");
CREATE INDEX "SalesPartnerInvitation_email_idx" ON "SalesPartnerInvitation"("email");

ALTER TABLE "SalesPartnerInvitation" ADD CONSTRAINT "SalesPartnerInvitation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesPartnerInvitation" ADD CONSTRAINT "SalesPartnerInvitation_salesPartnerId_fkey"
  FOREIGN KEY ("salesPartnerId") REFERENCES "SalesPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- パートナー独自の顧客メモ/タグ
CREATE TABLE "SalesPartnerCustomerNote" (
  "id"             TEXT NOT NULL,
  "salesPartnerId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "note"           TEXT,
  "tag"            TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesPartnerCustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPartnerCustomerNote_salesPartnerId_userId_key" ON "SalesPartnerCustomerNote"("salesPartnerId", "userId");
CREATE INDEX "SalesPartnerCustomerNote_userId_idx" ON "SalesPartnerCustomerNote"("userId");

ALTER TABLE "SalesPartnerCustomerNote" ADD CONSTRAINT "SalesPartnerCustomerNote_salesPartnerId_fkey"
  FOREIGN KEY ("salesPartnerId") REFERENCES "SalesPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesPartnerCustomerNote" ADD CONSTRAINT "SalesPartnerCustomerNote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
