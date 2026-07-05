CREATE TYPE "LedgerPeriodStatus" AS ENUM ('CLOSED', 'REOPENED');

CREATE TABLE "LedgerPeriodClose" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "periodMonth" DATE NOT NULL,
    "status" "LedgerPeriodStatus" NOT NULL DEFAULT 'CLOSED',
    "note" VARCHAR(500),
    "closedByUserId" UUID NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedByUserId" UUID,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerPeriodClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerPeriodClose_householdId_periodMonth_key" ON "LedgerPeriodClose"("householdId", "periodMonth");
CREATE INDEX "LedgerPeriodClose_householdId_status_periodMonth_idx" ON "LedgerPeriodClose"("householdId", "status", "periodMonth");
CREATE INDEX "LedgerPeriodClose_closedByUserId_idx" ON "LedgerPeriodClose"("closedByUserId");
CREATE INDEX "LedgerPeriodClose_reopenedByUserId_idx" ON "LedgerPeriodClose"("reopenedByUserId");

ALTER TABLE "LedgerPeriodClose"
  ADD CONSTRAINT "LedgerPeriodClose_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
