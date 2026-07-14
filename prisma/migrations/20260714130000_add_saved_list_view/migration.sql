-- 顧客一覧の保存ビュー（フィルタ・列・ソートのセットをタブとして保存）
CREATE TABLE "SavedListView" (
    "id" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "columns" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedListView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedListView_portal_ownerId_idx" ON "SavedListView"("portal", "ownerId");
