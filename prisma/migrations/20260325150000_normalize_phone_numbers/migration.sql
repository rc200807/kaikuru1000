-- Normalize existing phone numbers: remove hyphens
UPDATE "User" SET "phone" = REPLACE(REPLACE("phone", '-', ''), 'ー', '') WHERE "phone" LIKE '%-%' OR "phone" LIKE '%ー%';
