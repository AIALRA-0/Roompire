CREATE TABLE "ExpenseTag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseProposalTag" (
    "proposalId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseProposalTag_pkey" PRIMARY KEY ("proposalId","tagId")
);

CREATE UNIQUE INDEX "ExpenseTag_householdId_name_key" ON "ExpenseTag"("householdId", "name");
CREATE INDEX "ExpenseTag_householdId_idx" ON "ExpenseTag"("householdId");
CREATE INDEX "ExpenseProposalTag_tagId_idx" ON "ExpenseProposalTag"("tagId");

ALTER TABLE "ExpenseTag" ADD CONSTRAINT "ExpenseTag_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseProposalTag" ADD CONSTRAINT "ExpenseProposalTag_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseProposalTag" ADD CONSTRAINT "ExpenseProposalTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ExpenseTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
