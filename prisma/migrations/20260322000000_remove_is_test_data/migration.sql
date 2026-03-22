-- Delete test data: cascade through related tables first
-- PurchaseItems depend on VisitSchedule
DELETE FROM "PurchaseItem" WHERE "visitScheduleId" IN (
  SELECT "id" FROM "VisitSchedule" WHERE "userId" IN (
    SELECT "id" FROM "User" WHERE "isTestData" = true
  )
);

-- WorkItems depend on VisitSchedule
DELETE FROM "WorkItem" WHERE "visitScheduleId" IN (
  SELECT "id" FROM "VisitSchedule" WHERE "userId" IN (
    SELECT "id" FROM "User" WHERE "isTestData" = true
  )
);

-- VisitSchedules for test users
DELETE FROM "VisitSchedule" WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "isTestData" = true
);

-- PurchaseMemos for test users (should cascade but be safe)
DELETE FROM "PurchaseMemo" WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "isTestData" = true
);

-- DeliveryShipments for test users
DELETE FROM "DeliveryShipment" WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "isTestData" = true
);

-- AnnouncementRead for test users (if store reads exist)
DELETE FROM "AnnouncementRead" WHERE "storeId" IN (
  SELECT "id" FROM "User" WHERE "isTestData" = true
);

-- Now delete the test users
DELETE FROM "User" WHERE "isTestData" = true;

-- AlterTable: remove the column
ALTER TABLE "User" DROP COLUMN "isTestData";
