CREATE TABLE "RecurringExpenseTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "householdId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "merchant" TEXT,
    "categoryId" UUID,
    "originalAmount" DECIMAL(20,6) NOT NULL,
    "originalCurrency" CHAR(3) NOT NULL,
    "fxRate" DECIMAL(20,12),
    "participantUserIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpenseTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecurringExpenseTemplate_eventId_key" ON "RecurringExpenseTemplate"("eventId");
CREATE INDEX "RecurringExpenseTemplate_householdId_idx" ON "RecurringExpenseTemplate"("householdId");
CREATE INDEX "RecurringExpenseTemplate_createdByUserId_idx" ON "RecurringExpenseTemplate"("createdByUserId");
CREATE INDEX "RecurringExpenseTemplate_categoryId_idx" ON "RecurringExpenseTemplate"("categoryId");

ALTER TABLE "RecurringExpenseTemplate"
  ADD CONSTRAINT "RecurringExpenseTemplate_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringExpenseTemplate"
  ADD CONSTRAINT "RecurringExpenseTemplate_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringExpenseTemplate"
  ADD CONSTRAINT "RecurringExpenseTemplate_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
