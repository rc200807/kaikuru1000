-- リリースノート（運営=sysadmin → 店舗・管理ポータルへのプロダクト更新告知）機能を追加
-- ReleaseNote: 本体 / ReleaseNoteRead: 既読管理（店舗単位・管理者個人単位の両対応）

-- CreateTable
CREATE TABLE "ReleaseNote" (
    "id" TEXT NOT NULL,
    "version" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'feature',
    "targetStore" BOOLEAN NOT NULL DEFAULT true,
    "targetAdmin" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseNoteRead" (
    "id" TEXT NOT NULL,
    "releaseNoteId" TEXT NOT NULL,
    "readerType" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseNoteRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReleaseNote_isPublished_publishedAt_idx" ON "ReleaseNote"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "ReleaseNote_authorId_idx" ON "ReleaseNote"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseNoteRead_releaseNoteId_readerType_readerId_key" ON "ReleaseNoteRead"("releaseNoteId", "readerType", "readerId");

-- CreateIndex
CREATE INDEX "ReleaseNoteRead_readerType_readerId_idx" ON "ReleaseNoteRead"("readerType", "readerId");

-- AddForeignKey
ALTER TABLE "ReleaseNote" ADD CONSTRAINT "ReleaseNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseNoteRead" ADD CONSTRAINT "ReleaseNoteRead_releaseNoteId_fkey" FOREIGN KEY ("releaseNoteId") REFERENCES "ReleaseNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
