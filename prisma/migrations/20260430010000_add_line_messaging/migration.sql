-- Add LINE messaging tables (LineChannel, LineUser, LineMessage) + User relation

-- CreateTable
CREATE TABLE "LineChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelSecret" TEXT NOT NULL,
    "channelAccessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineUser" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pictureUrl" TEXT,
    "lineChannelId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineMessage" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "lineChannelId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "content" TEXT,
    "imageUrl" TEXT,
    "lineMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineChannel_channelId_key" ON "LineChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "LineUser_lineUserId_lineChannelId_key" ON "LineUser"("lineUserId", "lineChannelId");

-- CreateIndex
CREATE INDEX "LineUser_lineChannelId_idx" ON "LineUser"("lineChannelId");

-- CreateIndex
CREATE INDEX "LineUser_userId_idx" ON "LineUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LineMessage_lineMessageId_key" ON "LineMessage"("lineMessageId");

-- CreateIndex
CREATE INDEX "LineMessage_lineUserId_idx" ON "LineMessage"("lineUserId");

-- CreateIndex
CREATE INDEX "LineMessage_lineChannelId_idx" ON "LineMessage"("lineChannelId");

-- CreateIndex
CREATE INDEX "LineMessage_sentAt_idx" ON "LineMessage"("sentAt");

-- AddForeignKey
ALTER TABLE "LineUser" ADD CONSTRAINT "LineUser_lineChannelId_fkey" FOREIGN KEY ("lineChannelId") REFERENCES "LineChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineUser" ADD CONSTRAINT "LineUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineMessage" ADD CONSTRAINT "LineMessage_lineUserId_fkey" FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineMessage" ADD CONSTRAINT "LineMessage_lineChannelId_fkey" FOREIGN KEY ("lineChannelId") REFERENCES "LineChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
