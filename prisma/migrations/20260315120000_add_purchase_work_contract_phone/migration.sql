-- 買取品目テーブル
CREATE TABLE "PurchaseItem" (
    "id"              TEXT NOT NULL,
    "visitScheduleId" TEXT NOT NULL,
    "itemName"        TEXT NOT NULL,
    "category"        TEXT NOT NULL,
    "imageUrls"       TEXT NOT NULL DEFAULT '[]',
    "quantity"        INTEGER NOT NULL DEFAULT 1,
    "purchasePrice"   INTEGER NOT NULL DEFAULT 0,
    "aiResearch"      TEXT,
    "aiResearchedAt"  TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseItem_visitScheduleId_idx" ON "PurchaseItem"("visitScheduleId");

ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_visitScheduleId_fkey"
    FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 作業品目テーブル
CREATE TABLE "WorkItem" (
    "id"              TEXT NOT NULL,
    "visitScheduleId" TEXT NOT NULL,
    "workName"        TEXT NOT NULL,
    "unitPrice"       INTEGER NOT NULL DEFAULT 0,
    "quantity"        INTEGER NOT NULL DEFAULT 1,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkItem_visitScheduleId_idx" ON "WorkItem"("visitScheduleId");

ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_visitScheduleId_fkey"
    FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 売買契約書テーブル
CREATE TABLE "SalesContract" (
    "id"              TEXT NOT NULL,
    "visitScheduleId" TEXT NOT NULL,
    "signatureData"   TEXT NOT NULL,
    "pdfBase64"       TEXT,
    "customerEmail"   TEXT,
    "emailSentAt"     TIMESTAMP(3),
    "agreedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesContract_visitScheduleId_key" ON "SalesContract"("visitScheduleId");

ALTER TABLE "SalesContract" ADD CONSTRAINT "SalesContract_visitScheduleId_fkey"
    FOREIGN KEY ("visitScheduleId") REFERENCES "VisitSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- iPhone中古相場価格テーブル
CREATE TABLE "PhoneMarketPrice" (
    "id"        TEXT NOT NULL,
    "model"     TEXT NOT NULL,
    "series"    TEXT NOT NULL,
    "storage"   TEXT NOT NULL,
    "gradeA"    INTEGER,
    "gradeB"    INTEGER,
    "gradeC"    INTEGER,
    "source"    TEXT NOT NULL DEFAULT 'gemini',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneMarketPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneMarketPrice_model_storage_key" ON "PhoneMarketPrice"("model", "storage");
CREATE INDEX "PhoneMarketPrice_series_idx" ON "PhoneMarketPrice"("series");
