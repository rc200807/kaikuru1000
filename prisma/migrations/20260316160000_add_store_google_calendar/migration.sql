-- CreateTable
CREATE TABLE "StoreGoogleCalendar" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "googleEmail" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "calendarName" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreGoogleCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreGoogleCalendar_storeId_key" ON "StoreGoogleCalendar"("storeId");

-- AddForeignKey
ALTER TABLE "StoreGoogleCalendar" ADD CONSTRAINT "StoreGoogleCalendar_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add googleCalendarEventId to VisitSchedule
ALTER TABLE "VisitSchedule" ADD COLUMN "googleCalendarEventId" TEXT;
