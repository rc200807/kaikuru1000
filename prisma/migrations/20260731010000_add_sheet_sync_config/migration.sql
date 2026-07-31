-- 店舗情報・運営者情報のスプレッドシート双方向同期設定
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "storeInfoSpreadsheetId" TEXT;
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "storeInfoSheetName" TEXT NOT NULL DEFAULT '店舗情報';
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "operatorSpreadsheetId" TEXT;
ALTER TABLE "GoogleSheetsConfig" ADD COLUMN "operatorSheetName" TEXT NOT NULL DEFAULT '運営者情報';
