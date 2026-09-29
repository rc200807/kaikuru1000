-- 見積書・契約書の備考（書類に印字）
ALTER TABLE "Estimate" ADD COLUMN "remarks" TEXT;
ALTER TABLE "SalesContract" ADD COLUMN "remarks" TEXT;

-- 顧客: LINEアカウント名（手入力）／身分証確認時のふりがな
ALTER TABLE "User" ADD COLUMN "lineName" TEXT;
ALTER TABLE "User" ADD COLUMN "idFurigana" TEXT;

-- 案件: 流入経路。作成時に顧客の流入経路を写す。既存案件も顧客の現在値で埋める
ALTER TABLE "Deal" ADD COLUMN "leadSource" TEXT;
UPDATE "Deal" SET "leadSource" = u."leadSource"
FROM "User" u
WHERE "Deal"."userId" = u."id" AND u."leadSource" IS NOT NULL AND u."leadSource" <> '';
