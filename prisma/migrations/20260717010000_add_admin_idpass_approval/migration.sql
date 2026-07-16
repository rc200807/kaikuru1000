-- 管理ポータル: ID+パスワード方式の管理者メンバー（パスキー必須・superadmin承認必須）
-- 既存のメール招待管理者は authMethod='email' / status='active' で挙動不変

-- email を NULL 許容に（idpass方式はメールなし）
ALTER TABLE "Admin" ALTER COLUMN "email" DROP NOT NULL;

-- 新規カラム
ALTER TABLE "Admin" ADD COLUMN "loginId" TEXT;
ALTER TABLE "Admin" ADD COLUMN "authMethod" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "Admin" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Admin" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Admin" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- loginId の一意制約（NULL は重複可）
CREATE UNIQUE INDEX "Admin_loginId_key" ON "Admin"("loginId");
