-- AlterTable: 顧客によるOCR誤り報告フィールドの追加
ALTER TABLE "User" ADD COLUMN "idOcrIssueReport" TEXT;
