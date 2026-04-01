-- Add transferredAt column to DeliveryShipment for 振込済み tracking
ALTER TABLE "DeliveryShipment" ADD COLUMN "transferredAt" TIMESTAMP(3);
