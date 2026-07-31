-- 顧客情報のスプレッドシート双方向同期設定
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "customerSpreadsheetId" TEXT;
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "customerSheetName" TEXT NOT NULL DEFAULT '顧客情報';
