-- CreateTable
CREATE TABLE "VideoCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoCategory_name_key" ON "VideoCategory"("name");

-- CreateTable
CREATE TABLE "TrainingVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "youtubeUrl" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingVideo_categoryId_idx" ON "TrainingVideo"("categoryId");

-- CreateIndex
CREATE INDEX "TrainingVideo_isPublished_idx" ON "TrainingVideo"("isPublished");

-- CreateIndex
CREATE INDEX "TrainingVideo_adminId_idx" ON "TrainingVideo"("adminId");

-- AddForeignKey
ALTER TABLE "TrainingVideo" ADD CONSTRAINT "TrainingVideo_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "VideoCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingVideo" ADD CONSTRAINT "TrainingVideo_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
