-- CreateTable
CREATE TABLE "VisitStatus" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitStatus_key_key" ON "VisitStatus"("key");

-- Insert default statuses
INSERT INTO "VisitStatus" ("id", "key", "label", "color", "sortOrder", "isDefault", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'scheduled',   '予定',       '#3B82F6', 0, true,  NOW(), NOW()),
  (gen_random_uuid()::text, 'pending',     '未対応',     '#F59E0B', 1, false, NOW(), NOW()),
  (gen_random_uuid()::text, 'completed',   '対応完了',   '#10B981', 2, false, NOW(), NOW()),
  (gen_random_uuid()::text, 'rescheduled', 'リスケ',     '#8B5CF6', 3, false, NOW(), NOW()),
  (gen_random_uuid()::text, 'absent',      '不在',       '#6B7280', 4, false, NOW(), NOW()),
  (gen_random_uuid()::text, 'cancelled',   'キャンセル', '#EF4444', 5, false, NOW(), NOW());
