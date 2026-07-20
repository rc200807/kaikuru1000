-- CreateTable
CREATE TABLE "TrackingSite" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingButton" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "buttonKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "isConversion" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingButton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingVisitor" (
    "id" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstUrl" TEXT,
    "firstReferrer" TEXT,
    "userId" TEXT,

    CONSTRAINT "TrackingVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "siteId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryUrl" TEXT NOT NULL,
    "entryTitle" TEXT,
    "referrer" TEXT,
    "entryParams" TEXT NOT NULL DEFAULT '{}',
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "channel" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "screenSize" TEXT,
    "language" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "isFirstSession" BOOLEAN NOT NULL DEFAULT true,
    "hasConversion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TrackingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingPageView" (
    "id" TEXT NOT NULL,
    "pvKey" TEXT,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "queryParams" TEXT NOT NULL DEFAULT '{}',
    "durationSec" INTEGER,
    "scrollDepth" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingPageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "buttonId" TEXT,
    "inquiryId" TEXT,
    "formSubmissionId" TEXT,
    "storeId" TEXT,
    "url" TEXT,
    "isConversion" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingSite_siteKey_key" ON "TrackingSite"("siteKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingButton_buttonKey_key" ON "TrackingButton"("buttonKey");

-- CreateIndex
CREATE INDEX "TrackingButton_siteId_idx" ON "TrackingButton"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingVisitor_visitorKey_key" ON "TrackingVisitor"("visitorKey");

-- CreateIndex
CREATE INDEX "TrackingVisitor_userId_idx" ON "TrackingVisitor"("userId");

-- CreateIndex
CREATE INDEX "TrackingVisitor_lastSeenAt_idx" ON "TrackingVisitor"("lastSeenAt");

-- CreateIndex
CREATE INDEX "TrackingSession_visitorId_startedAt_idx" ON "TrackingSession"("visitorId", "startedAt");

-- CreateIndex
CREATE INDEX "TrackingSession_startedAt_idx" ON "TrackingSession"("startedAt");

-- CreateIndex
CREATE INDEX "TrackingSession_lastActivityAt_idx" ON "TrackingSession"("lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingPageView_pvKey_key" ON "TrackingPageView"("pvKey");

-- CreateIndex
CREATE INDEX "TrackingPageView_sessionId_occurredAt_idx" ON "TrackingPageView"("sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "TrackingPageView_occurredAt_idx" ON "TrackingPageView"("occurredAt");

-- CreateIndex
CREATE INDEX "TrackingEvent_visitorId_occurredAt_idx" ON "TrackingEvent"("visitorId", "occurredAt");

-- CreateIndex
CREATE INDEX "TrackingEvent_sessionId_idx" ON "TrackingEvent"("sessionId");

-- CreateIndex
CREATE INDEX "TrackingEvent_type_occurredAt_idx" ON "TrackingEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "TrackingEvent_storeId_occurredAt_idx" ON "TrackingEvent"("storeId", "occurredAt");

-- AddForeignKey
ALTER TABLE "TrackingButton" ADD CONSTRAINT "TrackingButton_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "TrackingSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingVisitor" ADD CONSTRAINT "TrackingVisitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "TrackingVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingPageView" ADD CONSTRAINT "TrackingPageView_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrackingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "TrackingVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrackingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
