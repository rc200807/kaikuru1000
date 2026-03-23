-- Add pre-consent fields to VisitSchedule
ALTER TABLE "VisitSchedule" ADD COLUMN "preConsentSignature" TEXT;
ALTER TABLE "VisitSchedule" ADD COLUMN "preConsentAt" TIMESTAMP(3);
ALTER TABLE "VisitSchedule" ADD COLUMN "staffName" TEXT;
