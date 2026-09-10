-- 分析APIの集計結果スナップショット（アクセス解析の概要を毎回再集計しないため）
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsSnapshot_cacheKey_key" ON "AnalyticsSnapshot"("cacheKey");
CREATE INDEX "AnalyticsSnapshot_kind_computedAt_idx" ON "AnalyticsSnapshot"("kind", "computedAt");
