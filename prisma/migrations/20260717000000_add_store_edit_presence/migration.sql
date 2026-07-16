-- 店舗一括編集のプレゼンステーブル（誰がどの店舗を編集中かの表示用。ロックはしない）
-- storeId が NULL の行は「一括編集モーダルを開いている」ことを表す

-- CreateTable
CREATE TABLE "StoreEditPresence" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "storeId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreEditPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreEditPresence_adminId_idx" ON "StoreEditPresence"("adminId");

-- CreateIndex
CREATE INDEX "StoreEditPresence_lastSeenAt_idx" ON "StoreEditPresence"("lastSeenAt");
