-- 請求項目マスタに「追加人員（人数のみ）」の可否を追加
ALTER TABLE "WorkItemMaster" ADD COLUMN "allowExtraStaff" BOOLEAN NOT NULL DEFAULT false;

-- 明細側：追加人員の人数と、備考の自由記入部分（notes は組み立て済みの表示テキスト）
ALTER TABLE "WorkItem" ADD COLUMN "extraStaffCount" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "notesInput" TEXT;

-- 請求項目に紐づくチェックボックスの選択肢
CREATE TABLE "WorkItemOption" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItemOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkItemOption_masterId_idx" ON "WorkItemOption"("masterId");
CREATE UNIQUE INDEX "WorkItemOption_masterId_label_key" ON "WorkItemOption"("masterId", "label");

ALTER TABLE "WorkItemOption" ADD CONSTRAINT "WorkItemOption_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "WorkItemMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 明細ごとのチェック結果（label はスナップショット）
CREATE TABLE "WorkItemOptionSelection" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "optionId" TEXT,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItemOptionSelection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkItemOptionSelection_workItemId_idx" ON "WorkItemOptionSelection"("workItemId");
CREATE INDEX "WorkItemOptionSelection_optionId_idx" ON "WorkItemOptionSelection"("optionId");

ALTER TABLE "WorkItemOptionSelection" ADD CONSTRAINT "WorkItemOptionSelection_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkItemOptionSelection" ADD CONSTRAINT "WorkItemOptionSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "WorkItemOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
