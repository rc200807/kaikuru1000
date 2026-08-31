-- パスワードリセットを店舗単位に限定するための列。
-- 同じメールアドレスが複数店舗で使われうるため、どの店舗のアカウントを対象にするかを保持する。
-- NULL は従来どおり「メールアドレス一致の全店舗」を対象とする（既存トークンとの互換）。
ALTER TABLE "PasswordResetToken" ADD COLUMN "storeId" TEXT;

CREATE INDEX "PasswordResetToken_storeId_idx" ON "PasswordResetToken"("storeId");
