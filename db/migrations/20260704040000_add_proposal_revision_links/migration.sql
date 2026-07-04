-- CreateIndex
CREATE INDEX "ExpenseProposal_supersedesProposalId_idx" ON "ExpenseProposal"("supersedesProposalId");

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_supersedesProposalId_fkey" FOREIGN KEY ("supersedesProposalId") REFERENCES "ExpenseProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
