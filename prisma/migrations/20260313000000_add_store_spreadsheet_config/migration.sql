-- AlterTable
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "storeSpreadsheetId" TEXT;
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "storeSheetName" TEXT NOT NULL DEFAULT '店舗マスター';
