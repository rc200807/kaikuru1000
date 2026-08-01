-- LINE友達登録（公開フォーム + LINE Login 自動紐付け）用のスキーマ拡張

-- AlterTable: LineChannel に既定チャネル・LINE Login 設定・友だち追加URLを追加
ALTER TABLE "LineChannel" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LineChannel" ADD COLUMN "loginChannelId" TEXT;
ALTER TABLE "LineChannel" ADD COLUMN "loginChannelSecret" TEXT;
ALTER TABLE "LineChannel" ADD COLUMN "addFriendUrl" TEXT;

-- AlterTable: LineUser に店舗割当・友だち状態・登録日時を追加
ALTER TABLE "LineUser" ADD COLUMN "storeId" TEXT;
ALTER TABLE "LineUser" ADD COLUMN "isFollowing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LineUser" ADD COLUMN "followedAt" TIMESTAMP(3);
ALTER TABLE "LineUser" ADD COLUMN "unfollowedAt" TIMESTAMP(3);
ALTER TABLE "LineUser" ADD COLUMN "registeredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LineUser_storeId_idx" ON "LineUser"("storeId");

-- AddForeignKey
ALTER TABLE "LineUser" ADD CONSTRAINT "LineUser_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: LINE Login 連携用ワンタイム state トークン
CREATE TABLE "LineLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "lineChannelId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineLinkToken_token_key" ON "LineLinkToken"("token");
CREATE INDEX "LineLinkToken_expiresAt_idx" ON "LineLinkToken"("expiresAt");
