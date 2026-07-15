-- 運営者情報の拡張:
-- 1) 会社名を「法人名」単一フィールドに統一（形態位置 prefixPosition を廃止）
-- 2) 銀行口座情報を追加
-- 3) 対応サービス（複数選択）を追加

-- 既存レコードの name は「プレフィックス除く会社名」だったため、
-- 従来の formalName() 相当（corporatePrefix + prefixPosition）の結果で name を上書きしてから
-- prefixPosition 列を削除する（表示上の名称が失われないようにする）
UPDATE "Operator"
SET "name" = CASE
  WHEN "entityType" = 'corporation' AND "corporatePrefix" IS NOT NULL AND "corporatePrefix" <> '' THEN
    CASE WHEN "prefixPosition" = 'after' THEN "name" || "corporatePrefix"
         ELSE "corporatePrefix" || "name"
    END
  ELSE "name"
END;

-- DropColumn
ALTER TABLE "Operator" DROP COLUMN "prefixPosition";

-- AddColumn: 対応サービス（複数選択。JSON配列文字列）
ALTER TABLE "Operator" ADD COLUMN "supportedServices" TEXT NOT NULL DEFAULT '[]';

-- AddColumn: 銀行口座情報
ALTER TABLE "Operator" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Operator" ADD COLUMN "branchName" TEXT;
ALTER TABLE "Operator" ADD COLUMN "accountType" TEXT;
ALTER TABLE "Operator" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "Operator" ADD COLUMN "accountHolder" TEXT;
