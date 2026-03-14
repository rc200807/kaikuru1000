-- AlterTable: 身分証OCR抽出フィールドの追加
ALTER TABLE "User" ADD COLUMN "idDocumentType"  TEXT;
ALTER TABLE "User" ADD COLUMN "idName"          TEXT;
ALTER TABLE "User" ADD COLUMN "idBirthDate"     TEXT;
ALTER TABLE "User" ADD COLUMN "idAddress"       TEXT;
ALTER TABLE "User" ADD COLUMN "idLicenseNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "idExpiryDate"    TEXT;
