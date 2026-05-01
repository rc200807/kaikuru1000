-- Operator テーブル作成
CREATE TABLE "Operator" (
  "id"                       TEXT NOT NULL,
  "entityType"               TEXT NOT NULL,
  "corporatePrefix"          TEXT,
  "prefixPosition"           TEXT,
  "name"                     TEXT NOT NULL,
  "address"                  TEXT,
  "representativeName"       TEXT NOT NULL,
  "representativeNameKana"   TEXT,
  "corporateNumber"          TEXT,
  "invoiceRegistered"        BOOLEAN NOT NULL DEFAULT false,
  "invoiceNumber"            TEXT,
  "phone"                    TEXT,
  "email"                    TEXT,
  "contractFilePath"         TEXT,
  "contractFileUploadedAt"   TIMESTAMP(3),
  "antiquePermitNumber"      TEXT,
  "antiqueOfficeAddress"     TEXT,
  "antiqueLicenseHolder"     TEXT,
  "publicSafetyCommission"   TEXT,
  "service"                  TEXT,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- Store に operatorId カラム追加
ALTER TABLE "Store" ADD COLUMN "operatorId" TEXT;

CREATE INDEX "Store_operatorId_idx" ON "Store"("operatorId");

ALTER TABLE "Store" ADD CONSTRAINT "Store_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "Operator"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
