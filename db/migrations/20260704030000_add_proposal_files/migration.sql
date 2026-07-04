-- CreateTable
CREATE TABLE "File" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "bucket" TEXT,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalFile" (
    "proposalId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'receipt',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalFile_pkey" PRIMARY KEY ("proposalId","fileId")
);

-- CreateIndex
CREATE UNIQUE INDEX "File_objectKey_key" ON "File"("objectKey");

-- CreateIndex
CREATE INDEX "File_householdId_idx" ON "File"("householdId");

-- CreateIndex
CREATE INDEX "File_uploadedByUserId_idx" ON "File"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "File_createdAt_idx" ON "File"("createdAt");

-- CreateIndex
CREATE INDEX "ProposalFile_fileId_idx" ON "ProposalFile"("fileId");

-- CreateIndex
CREATE INDEX "ProposalFile_createdByUserId_idx" ON "ProposalFile"("createdByUserId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFile" ADD CONSTRAINT "ProposalFile_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFile" ADD CONSTRAINT "ProposalFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
