-- 売買契約時に身分証画像を保存せず、手入力で本人確認した日時
ALTER TABLE "User" ADD COLUMN "idManualVerifiedAt" TIMESTAMP(3);
