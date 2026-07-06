CREATE TABLE "FxRateLookupLog" (
    "id" UUID NOT NULL,
    "providerChain" TEXT NOT NULL,
    "provider" TEXT,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "requestedDate" DATE NOT NULL,
    "rateDate" DATE,
    "rate" DECIMAL(24,12),
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sourceMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRateLookupLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FxRateLookupLog_status_check" CHECK ("status" IN ('SUCCESS', 'FAILED')),
    CONSTRAINT "FxRateLookupLog_duration_check" CHECK ("durationMs" IS NULL OR "durationMs" >= 0)
);

CREATE INDEX "FxRateLookupLog_createdAt_idx" ON "FxRateLookupLog"("createdAt");
CREATE INDEX "FxRateLookupLog_status_createdAt_idx" ON "FxRateLookupLog"("status", "createdAt");
CREATE INDEX "FxRateLookupLog_baseCurrency_quoteCurrency_requestedDate_idx" ON "FxRateLookupLog"("baseCurrency", "quoteCurrency", "requestedDate");
