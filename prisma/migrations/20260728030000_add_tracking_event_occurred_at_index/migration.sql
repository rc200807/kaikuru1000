-- アクセス解析の概要/CV推移は occurredAt の期間指定だけで TrackingEvent を絞るが、
-- 既存インデックスはすべて先頭カラムが別（visitorId/sessionId/type/storeId）のため使えず、
-- シーケンシャルスキャンになっていた。
CREATE INDEX IF NOT EXISTS "TrackingEvent_occurredAt_idx" ON "TrackingEvent"("occurredAt");
