-- CreateTable
CREATE TABLE "AnalyticsAiInsight" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "tab" TEXT,
    "paramsJson" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsAiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsAiInsight_kind_cacheKey_createdAt_idx" ON "AnalyticsAiInsight"("kind", "cacheKey", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsAiInsight_createdAt_idx" ON "AnalyticsAiInsight"("createdAt");
