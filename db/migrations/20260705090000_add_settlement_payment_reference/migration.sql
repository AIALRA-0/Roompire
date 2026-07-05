-- Add optional payment reference metadata for submitted settlements.
ALTER TABLE "Settlement" ADD COLUMN "paymentReference" VARCHAR(160);
