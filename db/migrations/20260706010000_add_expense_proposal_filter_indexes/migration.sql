-- Add read-path indexes for the dashboard expense proposal filters and cursor ordering.
CREATE INDEX "ExpenseProposal_household_queue_idx" ON "ExpenseProposal"("householdId", "updatedAt" DESC, "createdAt" DESC, "id" ASC);
CREATE INDEX "ExpenseProposal_household_status_queue_idx" ON "ExpenseProposal"("householdId", "status", "updatedAt" DESC, "createdAt" DESC, "id" ASC);
CREATE INDEX "ExpenseProposal_household_category_queue_idx" ON "ExpenseProposal"("householdId", "categoryId", "updatedAt" DESC, "createdAt" DESC, "id" ASC);
CREATE INDEX "ExpenseProposal_household_date_queue_idx" ON "ExpenseProposal"("householdId", "expenseDate", "updatedAt" DESC, "createdAt" DESC, "id" ASC);
CREATE INDEX "ExpenseProposal_household_originalAmount_idx" ON "ExpenseProposal"("householdId", "originalAmount");
CREATE INDEX "ExpenseProposal_household_settlementAmount_idx" ON "ExpenseProposal"("householdId", "settlementAmount");
CREATE INDEX "ExpenseProposal_household_creator_queue_idx" ON "ExpenseProposal"("householdId", "createdByUserId", "updatedAt" DESC, "createdAt" DESC, "id" ASC);
CREATE INDEX "ExpenseProposalTag_tagId_proposalId_idx" ON "ExpenseProposalTag"("tagId", "proposalId");
CREATE INDEX "ExpensePayer_userId_proposalId_idx" ON "ExpensePayer"("userId", "proposalId");
CREATE INDEX "ExpenseShare_debtorUserId_proposalId_idx" ON "ExpenseShare"("debtorUserId", "proposalId");
CREATE INDEX "ExpenseShare_creditorUserId_proposalId_idx" ON "ExpenseShare"("creditorUserId", "proposalId");
