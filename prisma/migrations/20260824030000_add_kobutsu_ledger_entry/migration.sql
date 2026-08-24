-- 古物台帳の補記（法定記載事項の手入力上書き）
CREATE TABLE "KobutsuLedgerEntry" (
    "id" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "kobutsuCategory" TEXT,
    "features" TEXT,
    "note" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KobutsuLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KobutsuLedgerEntry_purchaseItemId_key" ON "KobutsuLedgerEntry"("purchaseItemId");

ALTER TABLE "KobutsuLedgerEntry" ADD CONSTRAINT "KobutsuLedgerEntry_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
