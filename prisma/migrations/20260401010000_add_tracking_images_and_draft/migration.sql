-- Add tracking image URLs column
ALTER TABLE "DeliveryShipment" ADD COLUMN "trackingImageUrls" TEXT NOT NULL DEFAULT '[]';

-- Update default status to 'draft' (existing records keep their current status)
ALTER TABLE "DeliveryShipment" ALTER COLUMN "status" SET DEFAULT 'draft';
