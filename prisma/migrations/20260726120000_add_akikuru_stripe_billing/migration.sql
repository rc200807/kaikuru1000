-- アキクル案件のStripe請求・Connect分配
-- User.stripeCustomerId / Store の Connect フィールド / RevenueShareSetting / AkikuruInvoice / RevenueTransfer

-- AlterTable
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "stripeConnectAccountId" TEXT;
ALTER TABLE "Store" ADD COLUMN "stripeConnectStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Store" ADD COLUMN "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "stripeConnectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "stripeConnectOnboardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RevenueShareSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "systemPercent" INTEGER NOT NULL DEFAULT 0,
    "hqPercent" INTEGER NOT NULL DEFAULT 0,
    "storePercent" INTEGER NOT NULL DEFAULT 100,
    "systemRecipientType" TEXT NOT NULL DEFAULT 'platform',
    "systemStripeAccountId" TEXT,
    "hqRecipientType" TEXT NOT NULL DEFAULT 'platform',
    "hqStripeAccountId" TEXT,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueShareSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AkikuruInvoice" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "storeId" TEXT,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "hostedInvoiceUrl" TEXT,
    "stripeInvoicePdfUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "fundingInstructions" TEXT,
    "bankName" TEXT,
    "bankBranchName" TEXT,
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountHolder" TEXT,
    "distributionStatus" TEXT NOT NULL DEFAULT 'pending',
    "distributionError" TEXT,
    "distributedAt" TIMESTAMP(3),
    "sharePercentsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AkikuruInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueTransfer" (
    "id" TEXT NOT NULL,
    "akikuruInvoiceId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientStripeAccountId" TEXT,
    "amount" INTEGER NOT NULL,
    "stripeTransferId" TEXT,
    "sourceChargeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_stripeConnectAccountId_key" ON "Store"("stripeConnectAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AkikuruInvoice_dealId_key" ON "AkikuruInvoice"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "AkikuruInvoice_stripeInvoiceId_key" ON "AkikuruInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "AkikuruInvoice_storeId_idx" ON "AkikuruInvoice"("storeId");

-- CreateIndex
CREATE INDEX "AkikuruInvoice_status_idx" ON "AkikuruInvoice"("status");

-- CreateIndex
CREATE INDEX "AkikuruInvoice_distributionStatus_idx" ON "AkikuruInvoice"("distributionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueTransfer_stripeTransferId_key" ON "RevenueTransfer"("stripeTransferId");

-- CreateIndex
CREATE INDEX "RevenueTransfer_akikuruInvoiceId_idx" ON "RevenueTransfer"("akikuruInvoiceId");

-- CreateIndex
CREATE INDEX "RevenueTransfer_status_idx" ON "RevenueTransfer"("status");

-- AddForeignKey
ALTER TABLE "AkikuruInvoice" ADD CONSTRAINT "AkikuruInvoice_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkikuruInvoice" ADD CONSTRAINT "AkikuruInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueTransfer" ADD CONSTRAINT "RevenueTransfer_akikuruInvoiceId_fkey" FOREIGN KEY ("akikuruInvoiceId") REFERENCES "AkikuruInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
