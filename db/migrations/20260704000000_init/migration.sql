-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "FxPolicy" AS ENUM ('LOCK_AT_EXPENSE_DATE', 'ORIGINAL_CURRENCY_DEBT', 'MANUAL_RATE_WITH_APPROVAL', 'FX_DIFFERENCE_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SplitMethod" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ExpenseProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIALLY_APPROVED', 'APPROVED', 'PARTIALLY_MATURED', 'MATURED_TO_LEDGER', 'REJECTED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISPUTED', 'MATURED_TO_LEDGER');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'REQUEST_CHANGES');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('DEBT_CREATED', 'SETTLEMENT_RECORDED', 'REVERSAL', 'ADJUSTMENT', 'FX_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('TASK', 'CHORE', 'GROUP_ACTIVITY', 'BILL_DUE', 'REPAYMENT_DUE', 'SETTLEMENT_REMINDER', 'RECURRING_EXPENSE_GENERATION');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "preferredLocale" TEXT NOT NULL DEFAULT 'en-US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "defaultLocale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "settlementCurrency" CHAR(3) NOT NULL DEFAULT 'CNY',
    "fxPolicy" "FxPolicy" NOT NULL DEFAULT 'LOCK_AT_EXPENSE_DATE',
    "approvalPolicy" TEXT NOT NULL DEFAULT 'PAYER_AND_EACH_DEBTOR',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMembership" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayNameOverride" TEXT,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdInvite" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "email" TEXT,
    "tokenHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "householdId" UUID,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameZhCn" TEXT NOT NULL,
    "icon" TEXT,
    "colorToken" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseProposal" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "merchant" TEXT,
    "categoryId" UUID,
    "expenseDate" DATE NOT NULL,
    "dueDate" DATE,
    "originalAmount" DECIMAL(20,6) NOT NULL,
    "originalCurrency" CHAR(3) NOT NULL,
    "settlementCurrency" CHAR(3) NOT NULL,
    "settlementAmount" DECIMAL(20,6) NOT NULL,
    "splitMethod" "SplitMethod" NOT NULL,
    "fxPolicy" "FxPolicy" NOT NULL,
    "fxRate" DECIMAL(24,12),
    "fxRateDate" DATE,
    "fxProvider" TEXT,
    "fxLockedAt" TIMESTAMP(3),
    "status" "ExpenseProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "supersedesProposalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpensePayer" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountOriginal" DECIMAL(20,6) NOT NULL,
    "amountSettlement" DECIMAL(20,6) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExpensePayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseShare" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "debtorUserId" UUID NOT NULL,
    "creditorUserId" UUID NOT NULL,
    "shareOriginalAmount" DECIMAL(20,6) NOT NULL,
    "shareSettlementAmount" DECIMAL(20,6) NOT NULL,
    "shareCurrency" CHAR(3) NOT NULL,
    "settlementCurrency" CHAR(3) NOT NULL,
    "percentage" DECIMAL(10,6),
    "shareUnits" DECIMAL(20,6),
    "status" "ShareStatus" NOT NULL DEFAULT 'PENDING',
    "ledgerObligationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalApproval" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "shareId" UUID,
    "approverUserId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalComment" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "shareId" UUID,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "rateDate" DATE NOT NULL,
    "rate" DECIMAL(24,12) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceMeta" JSONB,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "description" TEXT,
    "sourceType" TEXT,
    "sourceId" UUID,
    "createdByUserId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversesTransactionId" UUID,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtObligation" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "ledgerTransactionId" UUID NOT NULL,
    "sourceShareId" UUID,
    "debtorUserId" UUID NOT NULL,
    "creditorUserId" UUID NOT NULL,
    "originalAmount" DECIMAL(20,6) NOT NULL,
    "originalCurrency" CHAR(3) NOT NULL,
    "settlementAmount" DECIMAL(20,6) NOT NULL,
    "settlementCurrency" CHAR(3) NOT NULL,
    "remainingAmount" DECIMAL(20,6) NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "DebtObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "ledgerTransactionId" UUID NOT NULL,
    "payerUserId" UUID NOT NULL,
    "payeeUserId" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "settlementDate" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "note" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAllocation" (
    "id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "debtObligationId" UUID NOT NULL,
    "amountApplied" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "SettlementAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "type" "CalendarEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrenceRule" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "rruleText" TEXT NOT NULL,
    "dtstart" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "count" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurrenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "categoryId" UUID,
    "dueAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "completedByUserId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "assignedUserId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLink" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "linkedType" TEXT NOT NULL,
    "linkedId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "bodyKey" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "prevHash" TEXT,
    "eventHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Household_slug_key" ON "Household"("slug");

-- CreateIndex
CREATE INDEX "Household_createdByUserId_idx" ON "Household"("createdByUserId");

-- CreateIndex
CREATE INDEX "HouseholdMembership_userId_idx" ON "HouseholdMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMembership_householdId_userId_key" ON "HouseholdMembership"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdInvite_tokenHash_key" ON "HouseholdInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "HouseholdInvite_householdId_idx" ON "HouseholdInvite"("householdId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_householdId_idx" ON "ExpenseCategory"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_householdId_key_key" ON "ExpenseCategory"("householdId", "key");

-- CreateIndex
CREATE INDEX "ExpenseProposal_householdId_status_idx" ON "ExpenseProposal"("householdId", "status");

-- CreateIndex
CREATE INDEX "ExpenseProposal_householdId_expenseDate_idx" ON "ExpenseProposal"("householdId", "expenseDate");

-- CreateIndex
CREATE INDEX "ExpenseProposal_createdByUserId_idx" ON "ExpenseProposal"("createdByUserId");

-- CreateIndex
CREATE INDEX "ExpensePayer_proposalId_idx" ON "ExpensePayer"("proposalId");

-- CreateIndex
CREATE INDEX "ExpensePayer_userId_idx" ON "ExpensePayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseShare_ledgerObligationId_key" ON "ExpenseShare"("ledgerObligationId");

-- CreateIndex
CREATE INDEX "ExpenseShare_proposalId_idx" ON "ExpenseShare"("proposalId");

-- CreateIndex
CREATE INDEX "ExpenseShare_debtorUserId_idx" ON "ExpenseShare"("debtorUserId");

-- CreateIndex
CREATE INDEX "ExpenseShare_creditorUserId_idx" ON "ExpenseShare"("creditorUserId");

-- CreateIndex
CREATE INDEX "ProposalApproval_proposalId_idx" ON "ProposalApproval"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalApproval_shareId_idx" ON "ProposalApproval"("shareId");

-- CreateIndex
CREATE INDEX "ProposalApproval_approverUserId_idx" ON "ProposalApproval"("approverUserId");

-- CreateIndex
CREATE INDEX "ProposalComment_proposalId_idx" ON "ProposalComment"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_provider_baseCurrency_quoteCurrency_rateDate_key" ON "FxRate"("provider", "baseCurrency", "quoteCurrency", "rateDate");

-- CreateIndex
CREATE INDEX "LedgerTransaction_householdId_occurredAt_idx" ON "LedgerTransaction"("householdId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_sourceType_sourceId_idx" ON "LedgerTransaction"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtObligation_sourceShareId_key" ON "DebtObligation"("sourceShareId");

-- CreateIndex
CREATE INDEX "DebtObligation_householdId_debtorUserId_idx" ON "DebtObligation"("householdId", "debtorUserId");

-- CreateIndex
CREATE INDEX "DebtObligation_householdId_creditorUserId_idx" ON "DebtObligation"("householdId", "creditorUserId");

-- CreateIndex
CREATE INDEX "DebtObligation_householdId_status_idx" ON "DebtObligation"("householdId", "status");

-- CreateIndex
CREATE INDEX "Settlement_householdId_payerUserId_idx" ON "Settlement"("householdId", "payerUserId");

-- CreateIndex
CREATE INDEX "Settlement_householdId_payeeUserId_idx" ON "Settlement"("householdId", "payeeUserId");

-- CreateIndex
CREATE INDEX "CalendarEvent_householdId_startAt_idx" ON "CalendarEvent"("householdId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_householdId_type_idx" ON "CalendarEvent"("householdId", "type");

-- CreateIndex
CREATE INDEX "RecurrenceRule_householdId_ownerType_ownerId_idx" ON "RecurrenceRule"("householdId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Task_householdId_status_idx" ON "Task"("householdId", "status");

-- CreateIndex
CREATE INDEX "Task_householdId_dueAt_idx" ON "Task"("householdId", "dueAt");

-- CreateIndex
CREATE INDEX "TaskAssignment_taskId_idx" ON "TaskAssignment"("taskId");

-- CreateIndex
CREATE INDEX "TaskAssignment_assignedUserId_idx" ON "TaskAssignment"("assignedUserId");

-- CreateIndex
CREATE INDEX "EventLink_eventId_idx" ON "EventLink"("eventId");

-- CreateIndex
CREATE INDEX "EventLink_linkedType_linkedId_idx" ON "EventLink"("linkedType", "linkedId");

-- CreateIndex
CREATE INDEX "Notification_householdId_userId_readAt_idx" ON "Notification"("householdId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditEvent_householdId_occurredAt_idx" ON "AuditEvent"("householdId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMembership" ADD CONSTRAINT "HouseholdMembership_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMembership" ADD CONSTRAINT "HouseholdMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayer" ADD CONSTRAINT "ExpensePayer_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "ExpenseShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtObligation" ADD CONSTRAINT "DebtObligation_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_debtObligationId_fkey" FOREIGN KEY ("debtObligationId") REFERENCES "DebtObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

