-- セッションごとのPV数を非正規化して持つ（アクセス解析の直帰率算出を1本のcountにするため）
ALTER TABLE "TrackingSession" ADD COLUMN "pageViewCount" INTEGER NOT NULL DEFAULT 0;

-- 既存セッションのぶんを埋める
UPDATE "TrackingSession" AS s
SET "pageViewCount" = c.cnt
FROM (
  SELECT "sessionId", COUNT(*)::int AS cnt
  FROM "TrackingPageView"
  GROUP BY "sessionId"
) AS c
WHERE c."sessionId" = s."id";

CREATE INDEX "TrackingSession_startedAt_pageViewCount_idx" ON "TrackingSession"("startedAt", "pageViewCount");
