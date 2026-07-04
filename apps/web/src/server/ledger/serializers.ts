import type {
  BalanceEdge,
  LedgerObligationWithRelations,
  LedgerTransactionWithRelations,
} from "./service";

function dateToDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function serializeBalanceEdge(edge: BalanceEdge) {
  return edge;
}

export function serializeLedgerObligation(obligation: LedgerObligationWithRelations) {
  return {
    id: obligation.id,
    householdId: obligation.householdId,
    ledgerTransactionId: obligation.ledgerTransactionId,
    sourceShareId: obligation.sourceShareId,
    debtorUserId: obligation.debtorUserId,
    creditorUserId: obligation.creditorUserId,
    originalAmount: obligation.originalAmount.toString(),
    originalCurrency: obligation.originalCurrency,
    settlementAmount: obligation.settlementAmount.toString(),
    settlementCurrency: obligation.settlementCurrency,
    remainingAmount: obligation.remainingAmount.toString(),
    status: obligation.status,
    dueDate: dateToDateOnly(obligation.dueDate),
    createdAt: obligation.createdAt.toISOString(),
    settledAt: obligation.settledAt?.toISOString() ?? null,
    sourceTransaction: {
      id: obligation.transaction.id,
      type: obligation.transaction.type,
      description: obligation.transaction.description,
      sourceType: obligation.transaction.sourceType,
      sourceId: obligation.transaction.sourceId,
      occurredAt: obligation.transaction.occurredAt.toISOString(),
    },
    allocations: obligation.allocations.map((allocation) => ({
      id: allocation.id,
      settlementId: allocation.settlementId,
      amountApplied: allocation.amountApplied.toString(),
    })),
  };
}

export function serializeLedgerTransaction(transaction: LedgerTransactionWithRelations) {
  return {
    id: transaction.id,
    householdId: transaction.householdId,
    type: transaction.type,
    description: transaction.description,
    sourceType: transaction.sourceType,
    sourceId: transaction.sourceId,
    createdByUserId: transaction.createdByUserId,
    occurredAt: transaction.occurredAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
    reversesTransactionId: transaction.reversesTransactionId,
    obligations: transaction.obligations.map((obligation) => ({
      id: obligation.id,
      sourceShareId: obligation.sourceShareId,
      debtorUserId: obligation.debtorUserId,
      creditorUserId: obligation.creditorUserId,
      originalAmount: obligation.originalAmount.toString(),
      originalCurrency: obligation.originalCurrency,
      settlementAmount: obligation.settlementAmount.toString(),
      settlementCurrency: obligation.settlementCurrency,
      remainingAmount: obligation.remainingAmount.toString(),
      status: obligation.status,
    })),
    settlements: transaction.settlements.map((settlement) => ({
      id: settlement.id,
      payerUserId: settlement.payerUserId,
      payeeUserId: settlement.payeeUserId,
      amount: settlement.amount.toString(),
      currency: settlement.currency,
      status: settlement.status,
    })),
  };
}

export type SerializedLedgerObligation = ReturnType<typeof serializeLedgerObligation>;
export type SerializedLedgerTransaction = ReturnType<typeof serializeLedgerTransaction>;
