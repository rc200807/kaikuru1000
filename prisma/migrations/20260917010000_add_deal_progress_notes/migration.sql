-- 案件の対応状況メモ（店舗が案件詳細から自由記入で残す。タイトル＋本文＋記入日時）。
-- 進捗タイムラインに、訪問・契約などの自動記録と並べて表示する。

-- CreateTable
CREATE TABLE "DealProgressNote" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByType" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealProgressNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 案件詳細の対応状況一覧（dealId で絞り createdAt 降順）
CREATE INDEX "DealProgressNote_dealId_createdAt_idx" ON "DealProgressNote"("dealId", "createdAt");

-- AddForeignKey
ALTER TABLE "DealProgressNote" ADD CONSTRAINT "DealProgressNote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
