-- 店舗メンバーに組織管理者権限を追加（'admin' | NULL）
ALTER TABLE "StoreMember" ADD COLUMN "orgRole" TEXT;
