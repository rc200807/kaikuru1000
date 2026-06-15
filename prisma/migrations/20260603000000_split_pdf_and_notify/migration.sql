-- 見積書・売買契約書を「買取(店舗)」「請求(運営会社)」の2PDFに分割するための列追加
ALTER TABLE "SalesContract" ADD COLUMN "invoicePdfBase64" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "invoicePdfBase64" TEXT;
-- 売買契約書作成時の通知先メール（未設定時は Store.email を使用）
ALTER TABLE "Store" ADD COLUMN "contractNotifyEmail" TEXT;
