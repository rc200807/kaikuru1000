-- AlterTable
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "inquirySpreadsheetId" TEXT;
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "inquirySheetName" TEXT NOT NULL DEFAULT 'お問い合わせ';
