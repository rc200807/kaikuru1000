-- フォーム: 顧客自動作成時に付けるタグの設定
ALTER TABLE "Form" ADD COLUMN "customerTagEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Form" ADD COLUMN "customerTag" TEXT;

-- 顧客タグ（フォーム回答からの自動付与＋管理者の手動付与）
CREATE TABLE "CustomerTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "formId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerTag_userId_label_key" ON "CustomerTag"("userId", "label");
CREATE INDEX "CustomerTag_label_idx" ON "CustomerTag"("label");
CREATE INDEX "CustomerTag_formId_idx" ON "CustomerTag"("formId");

ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;
