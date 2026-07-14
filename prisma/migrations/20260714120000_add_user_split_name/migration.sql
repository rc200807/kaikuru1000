-- 顧客氏名の姓・名分割フィールド追加（結合値 name/furigana は正データとして維持）
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastNameKana" TEXT;
ALTER TABLE "User" ADD COLUMN "firstNameKana" TEXT;

-- 既存データの backfill：全角/連続スペースを半角1個に正規化し、最初のスペースで姓・名に分割。
-- スペースなしは lastName に全文、firstName は NULL のまま（編集画面で漸進修正できる）。
UPDATE "User" SET
  "lastName" = CASE
    WHEN position(' ' IN regexp_replace(btrim("name"), '[\s　]+', ' ', 'g')) > 0
      THEN split_part(regexp_replace(btrim("name"), '[\s　]+', ' ', 'g'), ' ', 1)
    ELSE btrim("name")
  END,
  "firstName" = CASE
    WHEN position(' ' IN regexp_replace(btrim("name"), '[\s　]+', ' ', 'g')) > 0
      THEN substring(regexp_replace(btrim("name"), '[\s　]+', ' ', 'g')
           FROM position(' ' IN regexp_replace(btrim("name"), '[\s　]+', ' ', 'g')) + 1)
    ELSE NULL
  END
WHERE "lastName" IS NULL AND "name" IS NOT NULL AND btrim("name") <> '';

UPDATE "User" SET
  "lastNameKana" = CASE
    WHEN position(' ' IN regexp_replace(btrim("furigana"), '[\s　]+', ' ', 'g')) > 0
      THEN split_part(regexp_replace(btrim("furigana"), '[\s　]+', ' ', 'g'), ' ', 1)
    ELSE btrim("furigana")
  END,
  "firstNameKana" = CASE
    WHEN position(' ' IN regexp_replace(btrim("furigana"), '[\s　]+', ' ', 'g')) > 0
      THEN substring(regexp_replace(btrim("furigana"), '[\s　]+', ' ', 'g')
           FROM position(' ' IN regexp_replace(btrim("furigana"), '[\s　]+', ' ', 'g')) + 1)
    ELSE NULL
  END
WHERE "lastNameKana" IS NULL AND "furigana" IS NOT NULL AND btrim("furigana") <> '';
