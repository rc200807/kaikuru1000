-- LINE 自動配信シナリオ（LineScenario / LineScenarioStep / LineScenarioEnrollment / LineMessageQueue）

-- CreateTable
CREATE TABLE "LineScenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lineChannelId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "keyword" TEXT,
    "storeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineScenarioStep" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "sendHour" INTEGER,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineScenarioStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineScenarioEnrollment" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineScenarioEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineMessageQueue" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "lineChannelId" TEXT NOT NULL,
    "scenarioStepId" TEXT,
    "enrollmentId" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineMessageQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineScenario_lineChannelId_idx" ON "LineScenario"("lineChannelId");
CREATE INDEX "LineScenario_storeId_idx" ON "LineScenario"("storeId");
CREATE UNIQUE INDEX "LineScenarioStep_scenarioId_order_key" ON "LineScenarioStep"("scenarioId", "order");
CREATE UNIQUE INDEX "LineScenarioEnrollment_scenarioId_lineUserId_key" ON "LineScenarioEnrollment"("scenarioId", "lineUserId");
CREATE INDEX "LineScenarioEnrollment_lineUserId_idx" ON "LineScenarioEnrollment"("lineUserId");
CREATE INDEX "LineMessageQueue_status_scheduledAt_idx" ON "LineMessageQueue"("status", "scheduledAt");
CREATE INDEX "LineMessageQueue_lineUserId_idx" ON "LineMessageQueue"("lineUserId");
CREATE INDEX "LineMessageQueue_enrollmentId_idx" ON "LineMessageQueue"("enrollmentId");

-- AddForeignKey
ALTER TABLE "LineScenario" ADD CONSTRAINT "LineScenario_lineChannelId_fkey" FOREIGN KEY ("lineChannelId") REFERENCES "LineChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineScenario" ADD CONSTRAINT "LineScenario_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LineScenarioStep" ADD CONSTRAINT "LineScenarioStep_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "LineScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineScenarioEnrollment" ADD CONSTRAINT "LineScenarioEnrollment_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "LineScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineScenarioEnrollment" ADD CONSTRAINT "LineScenarioEnrollment_lineUserId_fkey" FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineMessageQueue" ADD CONSTRAINT "LineMessageQueue_lineUserId_fkey" FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
