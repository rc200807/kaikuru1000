-- Clear test bank account data for all @example.com users
UPDATE "User" SET
  "bankName" = NULL,
  "branchName" = NULL,
  "accountType" = NULL,
  "accountNumber" = NULL,
  "accountHolder" = NULL
WHERE "email" LIKE '%@example.com';
