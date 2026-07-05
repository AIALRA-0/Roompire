import type { SettlementWithRelations } from "./service";
import { createFileDownloadPath } from "@/server/files/service";

function dateToDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function serializeSettlement(settlement: SettlementWithRelations) {
  return {
    id: settlement.id,
    householdId: settlement.householdId,
    ledgerTransactionId: settlement.ledgerTransactionId,
    payerUserId: settlement.payerUserId,
    payeeUserId: settlement.payeeUserId,
    amount: settlement.amount.toString(),
    currency: settlement.currency,
    settlementDate: dateToDateOnly(settlement.settlementDate),
    method: settlement.method,
    paymentReference: settlement.paymentReference,
    status: settlement.status,
    note: settlement.note,
    createdByUserId: settlement.createdByUserId,
    createdAt: settlement.createdAt.toISOString(),
    sourceTransaction: {
      id: settlement.transaction.id,
      type: settlement.transaction.type,
      description: settlement.transaction.description,
      sourceType: settlement.transaction.sourceType,
      sourceId: settlement.transaction.sourceId,
      occurredAt: settlement.transaction.occurredAt.toISOString(),
    },
    allocations: settlement.allocations.map((allocation) => ({
      id: allocation.id,
      settlementId: allocation.settlementId,
      debtObligationId: allocation.debtObligationId,
      amountApplied: allocation.amountApplied.toString(),
    })),
    files:
      settlement.settlementFiles?.map((settlementFile) => {
        const { downloadUrl, expiresAt } = createFileDownloadPath(
          settlement.householdId,
          settlementFile.file.id,
        );

        return {
          id: settlementFile.file.id,
          purpose: settlementFile.purpose,
          uploadedByUserId: settlementFile.file.uploadedByUserId,
          originalFilename: settlementFile.file.originalFilename,
          mimeType: settlementFile.file.mimeType,
          sizeBytes: settlementFile.file.sizeBytes,
          sha256: settlementFile.file.sha256 === "pending" ? null : settlementFile.file.sha256,
          createdAt: settlementFile.createdAt.toISOString(),
          downloadUrl,
          downloadExpiresAt: expiresAt,
        };
      }) ?? [],
  };
}

export type SerializedSettlement = ReturnType<typeof serializeSettlement>;
