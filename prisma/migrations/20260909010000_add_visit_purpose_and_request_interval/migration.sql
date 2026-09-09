-- 利用間隔の既定値（訪問リクエスト／定期宅配）。0 は無制限。
ALTER TABLE "SiteConfig" ADD COLUMN "visitRequestIntervalMonths" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SiteConfig" ADD COLUMN "deliveryShipmentIntervalMonths" INTEGER NOT NULL DEFAULT 3;

-- 訪問目的マスタ（管理ポータルから管理）
CREATE TABLE "VisitPurpose" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitPurpose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitPurpose_name_key" ON "VisitPurpose"("name");

-- 訪問予定の「訪問目的」（名称はスナップショットとして併存）
ALTER TABLE "VisitSchedule" ADD COLUMN "purposeId" TEXT;
ALTER TABLE "VisitSchedule" ADD COLUMN "purposeName" TEXT;
CREATE INDEX "VisitSchedule_purposeId_idx" ON "VisitSchedule"("purposeId");
ALTER TABLE "VisitSchedule" ADD CONSTRAINT "VisitSchedule_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "VisitPurpose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 紙で作成した売買契約書の取引年月日（古物台帳の法定記載事項）
ALTER TABLE "Deal" ADD COLUMN "paperContractAgreedAt" TIMESTAMP(3);

-- Webフォーム（お問い合わせフォーム）由来の案件は、作成者をお客様名ではなく「Webフォーム」と表示する
UPDATE "Deal"
SET "createdByType" = 'webform', "createdByName" = 'Webフォーム'
WHERE "inquiryId" IS NOT NULL AND ("createdByType" = 'customer' OR "createdByType" IS NULL);

-- 訪問目的の初期選択肢（管理ポータルから追加・並び替え・無効化ができる）
INSERT INTO "VisitPurpose" ("id", "name", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
  ('vp_seed_purchase',  '買取査定',       10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vp_seed_pickup',    '引き取り',       20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vp_seed_estimate',  '見積のみ',       30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vp_seed_estate',    '遺品整理の相談', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vp_seed_cleanup',   '片付け・搬出',   50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vp_seed_greeting',  'ご挨拶・ご説明', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vp_seed_other',     'その他',         99, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 後日引取を「日時未定」でも登録できるようにするフラグ
ALTER TABLE "VisitSchedule" ADD COLUMN "revisitPending" BOOLEAN NOT NULL DEFAULT false;

-- 既に後日引取の日付が入っている訪問はフラグを立てておく（表示の互換）
UPDATE "VisitSchedule" SET "revisitPending" = true WHERE "revisitDate" IS NOT NULL;
