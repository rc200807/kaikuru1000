-- お知らせカテゴリのアイコンを「絵文字」から「フラットアイコンのキー」へ移行する。
-- 既存カテゴリの icon（絵文字）を対応するキーに変換し、列のデフォルトも変更する。

-- AlterColumn default
ALTER TABLE "AnnouncementCategory" ALTER COLUMN "icon" SET DEFAULT 'megaphone';

-- 既存データの絵文字 → アイコンキー変換
UPDATE "AnnouncementCategory" SET "icon" = 'megaphone' WHERE "icon" IN ('📢', '📣');
UPDATE "AnnouncementCategory" SET "icon" = 'bell'      WHERE "icon" = '🔔';
UPDATE "AnnouncementCategory" SET "icon" = 'bolt'      WHERE "icon" = '⚡';
UPDATE "AnnouncementCategory" SET "icon" = 'sparkles'  WHERE "icon" IN ('🎉', '✨');
UPDATE "AnnouncementCategory" SET "icon" = 'gift'      WHERE "icon" = '🎁';
UPDATE "AnnouncementCategory" SET "icon" = 'wrench'    WHERE "icon" IN ('🛠️', '🛠', '🔧');
UPDATE "AnnouncementCategory" SET "icon" = 'rocket'    WHERE "icon" = '🚀';
UPDATE "AnnouncementCategory" SET "icon" = 'clipboard' WHERE "icon" = '📋';
UPDATE "AnnouncementCategory" SET "icon" = 'lightbulb' WHERE "icon" = '💡';
UPDATE "AnnouncementCategory" SET "icon" = 'warning'   WHERE "icon" IN ('⚠️', '⚠');
UPDATE "AnnouncementCategory" SET "icon" = 'calendar'  WHERE "icon" = '📅';
UPDATE "AnnouncementCategory" SET "icon" = 'star'      WHERE "icon" = '⭐';

-- 上記いずれにも一致しない旧アイコン（想定外の絵文字など）はデフォルトへ寄せる
UPDATE "AnnouncementCategory" SET "icon" = 'megaphone'
  WHERE "icon" NOT IN ('megaphone', 'bell', 'bolt', 'sparkles', 'gift', 'wrench', 'rocket', 'clipboard', 'lightbulb', 'warning', 'calendar', 'star');
