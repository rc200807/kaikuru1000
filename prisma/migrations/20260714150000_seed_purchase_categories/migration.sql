-- 買取カテゴリ: 出張買取業界で一般的な分類を調査し、未整備だったカテゴリを追加
-- 既存カテゴリ名と重複する場合は何もしない（ON CONFLICT DO NOTHING）ため再実行しても安全
WITH base AS (
  SELECT COALESCE(MAX("sortOrder"), 0) AS max_order FROM "PurchaseCategory"
),
new_categories(name, rn) AS (
  VALUES
    ('骨董品・美術品', 1),
    ('着物・和装品', 2),
    ('毛皮・コート', 3),
    ('楽器', 4),
    ('カメラ・光学機器', 5),
    ('パソコン・PC周辺機器', 6),
    ('スマートフォン・タブレット', 7),
    ('ゲーム機・ゲームソフト', 8),
    ('本・雑誌・コミック', 9),
    ('CD・DVD・Blu-ray', 10),
    ('切手・古銭・金券', 11),
    ('酒類（未開栓）', 12),
    ('スポーツ・アウトドア用品', 13),
    ('自転車', 14),
    ('家具・インテリア', 15),
    ('キッチン用品・食器', 16),
    ('仏具・神具', 17),
    ('農機具・工具', 18),
    ('ベビー・キッズ用品', 19)
)
INSERT INTO "PurchaseCategory" (id, name, "sortOrder", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || new_categories.name),
  new_categories.name,
  base.max_order + new_categories.rn,
  now(),
  now()
FROM new_categories, base
ON CONFLICT (name) DO NOTHING;

-- 「その他」は一覧の末尾に来るよう並び順を新規カテゴリの後ろへ更新
UPDATE "PurchaseCategory"
SET "sortOrder" = (SELECT MAX("sortOrder") FROM "PurchaseCategory") + 1
WHERE name = 'その他';
