-- CreateTable
CREATE TABLE "SupplierAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "loginId" TEXT NOT NULL,
    "passwordEnc" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAccount_pkey" PRIMARY KEY ("id")
);
