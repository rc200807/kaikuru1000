-- 店舗別の問い合わせ記録シート（Googleスプレッドシート）
ALTER TABLE "Store" ADD COLUMN "inquirySpreadsheetId" TEXT;
ALTER TABLE "Store" ADD COLUMN "inquirySheetUrl" TEXT;
ALTER TABLE "Store" ADD COLUMN "inquirySheetSharedEmails" TEXT;
ALTER TABLE "Store" ADD COLUMN "inquirySheetIssuedAt" TIMESTAMP(3);
