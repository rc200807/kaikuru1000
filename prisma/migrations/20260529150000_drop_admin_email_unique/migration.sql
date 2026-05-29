-- 同一メールアドレスで「管理ポータルの管理者」と「システム管理者」を
-- 別アカウントとして持てるようにするため、Admin.email の一意制約を解除する。
-- DropIndex
DROP INDEX IF EXISTS "Admin_email_key";
