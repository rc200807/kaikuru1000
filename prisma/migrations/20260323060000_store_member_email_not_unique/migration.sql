-- Drop the global unique constraint on email
DROP INDEX IF EXISTS "StoreMember_email_key";

-- Add unique constraint per store (same email allowed across different stores)
CREATE UNIQUE INDEX "StoreMember_storeId_email_key" ON "StoreMember"("storeId", "email");
