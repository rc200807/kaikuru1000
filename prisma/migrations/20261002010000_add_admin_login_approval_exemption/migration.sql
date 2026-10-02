-- ID+パスワード方式の管理者: ログイン承認不要期間（この期間内はログインリクエストを省略）
ALTER TABLE "Admin" ADD COLUMN "loginApprovalExemptFrom" TIMESTAMP(3);
ALTER TABLE "Admin" ADD COLUMN "loginApprovalExemptUntil" TIMESTAMP(3);
ALTER TABLE "Admin" ADD COLUMN "loginApprovalExemptByName" TEXT;
