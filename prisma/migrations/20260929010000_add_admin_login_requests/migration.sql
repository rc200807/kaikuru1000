-- 管理ポータル: ID+パスワード方式の管理者はパスキー不要に変更。
-- 代わりにログインのたびに「ログインリクエスト」を出し、管理者以上の承認でログインを確定する。

CREATE TABLE "AdminLoginRequest" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ip" TEXT,
    "userAgent" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminLoginRequest_tokenHash_key" ON "AdminLoginRequest"("tokenHash");
CREATE INDEX "AdminLoginRequest_status_expiresAt_idx" ON "AdminLoginRequest"("status", "expiresAt");
CREATE INDEX "AdminLoginRequest_adminId_idx" ON "AdminLoginRequest"("adminId");

ALTER TABLE "AdminLoginRequest" ADD CONSTRAINT "AdminLoginRequest_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 旧フローの途中状態（パスキー登録待ち / superadmin承認待ち）は廃止。
-- 以後はログインリクエストの承認で本人確認するため、有効アカウントとして扱う。
UPDATE "Admin" SET "status" = 'active'
WHERE "authMethod" = 'idpass' AND "status" IN ('pending_passkey', 'pending_approval');
