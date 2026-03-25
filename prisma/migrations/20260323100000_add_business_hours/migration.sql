-- AlterTable
ALTER TABLE "Store" ADD COLUMN "businessHoursStart" TEXT DEFAULT '10:00';
ALTER TABLE "Store" ADD COLUMN "businessHoursEnd" TEXT DEFAULT '19:00';
ALTER TABLE "Store" ADD COLUMN "businessDays" TEXT DEFAULT '[0,1,2,3,4,5,6]';
