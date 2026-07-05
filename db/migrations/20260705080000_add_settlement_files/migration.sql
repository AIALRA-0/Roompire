-- CreateTable
CREATE TABLE "SettlementFile" (
    "settlementId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'evidence',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementFile_pkey" PRIMARY KEY ("settlementId","fileId")
);

-- CreateIndex
CREATE INDEX "SettlementFile_fileId_idx" ON "SettlementFile"("fileId");

-- CreateIndex
CREATE INDEX "SettlementFile_createdByUserId_idx" ON "SettlementFile"("createdByUserId");

-- AddForeignKey
ALTER TABLE "SettlementFile" ADD CONSTRAINT "SettlementFile_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementFile" ADD CONSTRAINT "SettlementFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
