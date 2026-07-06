ALTER TABLE "Household"
  ADD COLUMN "operationalRetentionDays" INTEGER,
  ADD COLUMN "attachmentRetentionDays" INTEGER;

ALTER TABLE "Household"
  ADD CONSTRAINT "Household_operational_retention_days_check"
  CHECK ("operationalRetentionDays" IS NULL OR ("operationalRetentionDays" >= 30 AND "operationalRetentionDays" <= 3650)),
  ADD CONSTRAINT "Household_attachment_retention_days_check"
  CHECK ("attachmentRetentionDays" IS NULL OR ("attachmentRetentionDays" >= 30 AND "attachmentRetentionDays" <= 3650));
