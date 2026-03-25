-- Make email optional for users (admin/store can register without email)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
