-- 店舗に対応サービス（買いクル/アキクル）フィールドを追加
ALTER TABLE "Store" ADD COLUMN "supportedServices" TEXT NOT NULL DEFAULT '[]';

-- バックフィル: 運営者が対応サービスを設定済みならそれを継承、それ以外は買いクルのみ
UPDATE "Store" s
SET "supportedServices" = COALESCE(
  (SELECT o."supportedServices" FROM "Operator" o
   WHERE o."id" = s."operatorId" AND o."supportedServices" IS NOT NULL AND o."supportedServices" <> '[]'),
  '["kaikuru"]'
);
