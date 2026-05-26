-- 請求書への顧客署名（売買契約とは別契約として分離保存）
ALTER TABLE "SalesContract" ADD COLUMN "invoiceSignatureData" TEXT;
