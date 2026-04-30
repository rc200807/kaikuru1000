-- Form: 回答から顧客を自動作成する設定
ALTER TABLE "Form" ADD COLUMN "customerCreate"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Form" ADD COLUMN "customerType"     TEXT;
ALTER TABLE "Form" ADD COLUMN "customerTypes"    TEXT;
ALTER TABLE "Form" ADD COLUMN "customerFieldMap" TEXT;
ALTER TABLE "Form" ADD COLUMN "customerStoreId"  TEXT;

CREATE INDEX "Form_customerStoreId_idx" ON "Form"("customerStoreId");

ALTER TABLE "Form" ADD CONSTRAINT "Form_customerStoreId_fkey"
  FOREIGN KEY ("customerStoreId") REFERENCES "Store"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FormSubmission: 自動作成された顧客への紐付け
ALTER TABLE "FormSubmission" ADD COLUMN "userId" TEXT;

CREATE INDEX "FormSubmission_userId_idx" ON "FormSubmission"("userId");

ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
