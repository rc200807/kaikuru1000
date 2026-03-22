-- AnnouncementCategory table
CREATE TABLE "AnnouncementCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "icon" TEXT NOT NULL DEFAULT '📢',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AnnouncementCategory_name_key" ON "AnnouncementCategory"("name");

-- Add categoryId and priority to Announcement
ALTER TABLE "Announcement" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Announcement" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
CREATE INDEX "Announcement_categoryId_idx" ON "Announcement"("categoryId");
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AnnouncementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AnnouncementRead table
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "announcementId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementRead_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_storeId_key" ON "AnnouncementRead"("announcementId", "storeId");
CREATE INDEX "AnnouncementRead_storeId_idx" ON "AnnouncementRead"("storeId");

-- Seed default categories
INSERT INTO "AnnouncementCategory" ("id", "name", "color", "icon", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('cat_general', 'お知らせ', '#6B7280', '📢', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_important', '重要', '#DC2626', '🔴', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_system', 'システム', '#2563EB', '⚙️', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_campaign', 'キャンペーン', '#059669', '🎉', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
