-- 顧客プロフィールの生年月日（身分証OCRから選択反映）
ALTER TABLE "User" ADD COLUMN "birthDate" TEXT;

-- 紙で作成した売買契約書の写真URL（JSON配列）
ALTER TABLE "Deal" ADD COLUMN "paperContractImages" TEXT NOT NULL DEFAULT '[]';
