-- 店舗の支払い基盤（システム利用料の月額課金・店舗決済台帳・領収書採番）

-- Store: 支払い用 Stripe Customer
ALTER TABLE "Store" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "Store_stripeCustomerId_key" ON "Store"("stripeCustomerId");

-- 月額システム利用料の設定（sysadmin が店舗ごとに設定）
CREATE TABLE "SystemFeeSetting" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFeeSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SystemFeeSetting_storeId_key" ON "SystemFeeSetting"("storeId");
ALTER TABLE "SystemFeeSetting" ADD CONSTRAINT "SystemFeeSetting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 店舗の決済台帳
CREATE TABLE "StorePayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'system_fee',
    "billingMonth" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripePaymentIntentId" TEXT,
    "failureMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "receiptName" TEXT,
    "receiptIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StorePayment_stripePaymentIntentId_key" ON "StorePayment"("stripePaymentIntentId");
CREATE UNIQUE INDEX "StorePayment_receiptNumber_key" ON "StorePayment"("receiptNumber");
CREATE UNIQUE INDEX "StorePayment_storeId_kind_billingMonth_key" ON "StorePayment"("storeId", "kind", "billingMonth");
CREATE INDEX "StorePayment_storeId_createdAt_idx" ON "StorePayment"("storeId", "createdAt");
CREATE INDEX "StorePayment_status_idx" ON "StorePayment"("status");
CREATE INDEX "StorePayment_billingMonth_idx" ON "StorePayment"("billingMonth");
ALTER TABLE "StorePayment" ADD CONSTRAINT "StorePayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 領収書番号の採番カウンタ（シングルトン）
CREATE TABLE "ReceiptCounter" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("id")
);
