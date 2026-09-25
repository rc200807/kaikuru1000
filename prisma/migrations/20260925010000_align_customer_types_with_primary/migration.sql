-- 顧客詳細の「顧客タイプ」プルダウンで主タイプ(customerType)だけを変えると、
-- 表示バッジ・一覧の絞り込みに使う customerTypes が旧タイプのまま残っていた。
-- 主タイプを含んでいない customerTypes を [主タイプ] に揃える（一括変更と同じ規則）。
UPDATE "User"
SET "customerTypes" = '["' || "customerType" || '"]'
WHERE "customerTypes" <> '[]'
  AND "customerTypes" NOT LIKE ('%"' || "customerType" || '"%');
