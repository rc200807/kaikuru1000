-- 店舗の銀行口座情報を構造化フィールドに対応（全銀データ検索での入力用）
-- 既存の bankInfo（自由記述）はフォーマットが不定のため自動移行はせず、
-- 互換のためレガシー表示用に列は残す。

ALTER TABLE "Store" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Store" ADD COLUMN "branchName" TEXT;
ALTER TABLE "Store" ADD COLUMN "accountType" TEXT;
ALTER TABLE "Store" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "Store" ADD COLUMN "accountHolder" TEXT;
