-- AlterTable: 再訪問日フィールドを追加
ALTER TABLE "VisitSchedule" ADD COLUMN "revisitDate" TIMESTAMP(3);
ALTER TABLE "VisitSchedule" ADD COLUMN "revisitStart" TEXT;
ALTER TABLE "VisitSchedule" ADD COLUMN "revisitEnd" TEXT;
ALTER TABLE "VisitSchedule" ADD COLUMN "revisitNote" TEXT;

-- Insert 後日引取 status
INSERT INTO "VisitStatus" ("id", "key", "label", "color", "sortOrder", "isDefault", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'revisit', '後日引取', '#F97316', 6, false, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
