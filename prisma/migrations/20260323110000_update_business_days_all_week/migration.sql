-- Update existing stores to include weekends in business days
UPDATE "Store" SET "businessDays" = '[0,1,2,3,4,5,6]' WHERE "businessDays" = '[1,2,3,4,5]';
