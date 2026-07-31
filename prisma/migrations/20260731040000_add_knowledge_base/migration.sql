-- ナレッジベース（FAQ）とAIチャット

CREATE TABLE "FaqCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FaqCategory_name_key" ON "FaqCategory"("name");

CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "categoryId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'all',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Faq_categoryId_idx" ON "Faq"("categoryId");
CREATE INDEX "Faq_isPublished_visibility_idx" ON "Faq"("isPublished", "visibility");

ALTER TABLE "Faq" ADD CONSTRAINT "Faq_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "FaqCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Faq" ADD CONSTRAINT "Faq_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "KnowledgeChatSession" (
    "id" TEXT NOT NULL,
    "viewerType" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "storeId" TEXT,
    "messages" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChatSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeChatSession_viewerType_viewerId_key"
  ON "KnowledgeChatSession"("viewerType", "viewerId");

CREATE TABLE "KnowledgeQuery" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answered" BOOLEAN NOT NULL,
    "usedFaqIds" TEXT NOT NULL DEFAULT '[]',
    "viewerType" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "storeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeQuery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeQuery_answered_status_createdAt_idx"
  ON "KnowledgeQuery"("answered", "status", "createdAt");
CREATE INDEX "KnowledgeQuery_viewerType_viewerId_createdAt_idx"
  ON "KnowledgeQuery"("viewerType", "viewerId", "createdAt");
