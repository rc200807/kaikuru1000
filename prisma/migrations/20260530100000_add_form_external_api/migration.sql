-- フォーム回答の外部API送信（汎用Webhook）設定と送信状態の追加

-- AlterTable: Form に外部API送信設定を追加
ALTER TABLE "Form" ADD COLUMN "externalApiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Form" ADD COLUMN "externalApiUrl" TEXT;
ALTER TABLE "Form" ADD COLUMN "externalApiKeyEnc" TEXT;
ALTER TABLE "Form" ADD COLUMN "externalApiHeaders" TEXT;
ALTER TABLE "Form" ADD COLUMN "externalApiStaticFields" TEXT;
ALTER TABLE "Form" ADD COLUMN "externalApiFieldMap" TEXT;
ALTER TABLE "Form" ADD COLUMN "externalApiNotifyEmails" TEXT;

-- AlterTable: FormSubmission に外部API送信の状態を追加
ALTER TABLE "FormSubmission" ADD COLUMN "externalApiPushedAt" TIMESTAMP(3);
ALTER TABLE "FormSubmission" ADD COLUMN "externalApiError" TEXT;
