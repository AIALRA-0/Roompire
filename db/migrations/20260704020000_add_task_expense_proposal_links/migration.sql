-- CreateTable
CREATE TABLE "TaskExpenseProposalLink" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExpenseProposalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskExpenseProposalLink_taskId_key" ON "TaskExpenseProposalLink"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExpenseProposalLink_proposalId_key" ON "TaskExpenseProposalLink"("proposalId");

-- CreateIndex
CREATE INDEX "TaskExpenseProposalLink_proposalId_idx" ON "TaskExpenseProposalLink"("proposalId");

-- CreateIndex
CREATE INDEX "TaskExpenseProposalLink_createdByUserId_idx" ON "TaskExpenseProposalLink"("createdByUserId");

-- AddForeignKey
ALTER TABLE "TaskExpenseProposalLink" ADD CONSTRAINT "TaskExpenseProposalLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExpenseProposalLink" ADD CONSTRAINT "TaskExpenseProposalLink_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
