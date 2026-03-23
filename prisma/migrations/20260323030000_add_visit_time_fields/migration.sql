-- Add start/end time fields to VisitSchedule
ALTER TABLE "VisitSchedule" ADD COLUMN "startTime" TEXT;
ALTER TABLE "VisitSchedule" ADD COLUMN "endTime" TEXT;
