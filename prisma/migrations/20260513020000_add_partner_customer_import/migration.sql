-- セールスパートナーによる顧客CSVインポート履歴
CREATE TABLE "PartnerCustomerImport" (
  "id"           TEXT NOT NULL,
  "partnerId"    TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "totalRows"    INTEGER NOT NULL,
  "createdCount" INTEGER NOT NULL,
  "updatedCount" INTEGER NOT NULL,
  "errorCount"   INTEGER NOT NULL,
  "errors"       JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PartnerCustomerImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerCustomerImport_partnerId_idx" ON "PartnerCustomerImport"("partnerId");
CREATE INDEX "PartnerCustomerImport_createdAt_idx" ON "PartnerCustomerImport"("createdAt");

ALTER TABLE "PartnerCustomerImport" ADD CONSTRAINT "PartnerCustomerImport_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "SalesPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
