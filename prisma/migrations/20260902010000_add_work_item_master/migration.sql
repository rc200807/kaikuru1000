-- 請求項目マスタ（管理ポータルから設定し、案件の請求項目はここから選択させる）
CREATE TABLE "WorkItemMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultUnitPrice" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItemMaster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkItemMaster_name_key" ON "WorkItemMaster"("name");

-- 既存の請求項目からマスタ参照を持てるようにする（既存行は NULL のまま）
ALTER TABLE "WorkItem" ADD COLUMN "masterId" TEXT;

CREATE INDEX "WorkItem_masterId_idx" ON "WorkItem"("masterId");

ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "WorkItemMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
