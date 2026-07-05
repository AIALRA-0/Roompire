ALTER TABLE "Notification" ADD COLUMN "dedupeKey" VARCHAR(200);

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");
