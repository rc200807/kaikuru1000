-- Product テーブル
CREATE TABLE "Product" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "purchasePrice" INTEGER NOT NULL,
  "sellingPrice"  INTEGER NOT NULL,
  "stock"         INTEGER NOT NULL DEFAULT 0,
  "hasVariants"   BOOLEAN NOT NULL DEFAULT false,
  "imageUrl"      TEXT,
  "supplierUrl"   TEXT,
  "supplierEmail" TEXT,
  "supplierNote"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- ProductVariant テーブル
CREATE TABLE "ProductVariant" (
  "id"           TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "sizeName"     TEXT NOT NULL,
  "stock"        INTEGER NOT NULL DEFAULT 0,
  "sellingPrice" INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Employee テーブル
CREATE TABLE "Employee" (
  "id"                            TEXT NOT NULL,
  "employeeNumber"                TEXT NOT NULL,
  "lastName"                      TEXT NOT NULL,
  "firstName"                     TEXT NOT NULL,
  "lastNameKana"                  TEXT,
  "firstNameKana"                 TEXT,
  "hireDate"                      TIMESTAMP(3),
  "hireType"                      TEXT,
  "employmentType"                TEXT,
  "department"                    TEXT,
  "jobTitle"                      TEXT,
  "jobCategory"                   TEXT,
  "jobDescription"                TEXT,
  "resignDate"                    TIMESTAMP(3),
  "resignType"                    TEXT,
  "gender"                        TEXT,
  "workEmail"                     TEXT,
  "workPhone"                     TEXT,
  "dateOfBirth"                   TIMESTAMP(3),
  "address"                       TEXT,
  "emergencyContact"              TEXT,
  "personalPhone"                 TEXT,
  "basicPensionNumberEnc"         TEXT,
  "healthInsuranceNumberEnc"      TEXT,
  "employmentInsuranceNumberEnc"  TEXT,
  "residenceCardNumberEnc"        TEXT,
  "payrollBankInfoEnc"            TEXT,
  "qualifications"                TEXT,
  "resumeDriveUrl"                TEXT,
  "businessCardDriveUrl"          TEXT,
  "profilePhotoDriveUrl"          TEXT,
  "maritalStatus"                 TEXT,
  "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
CREATE INDEX "Employee_department_idx"           ON "Employee"("department");
CREATE INDEX "Employee_resignDate_idx"           ON "Employee"("resignDate");
