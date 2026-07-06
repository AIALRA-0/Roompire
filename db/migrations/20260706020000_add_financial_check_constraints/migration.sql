-- Enforce ledger-critical numeric and participant invariants at the database boundary.
ALTER TABLE "ExpenseProposal"
  ADD CONSTRAINT "ExpenseProposal_positive_amounts_check"
    CHECK ("originalAmount" > 0 AND "settlementAmount" > 0),
  ADD CONSTRAINT "ExpenseProposal_positive_fx_rate_check"
    CHECK ("fxRate" IS NULL OR "fxRate" > 0),
  ADD CONSTRAINT "ExpenseProposal_positive_revision_check"
    CHECK ("revisionNumber" >= 1);

ALTER TABLE "ExpensePayer"
  ADD CONSTRAINT "ExpensePayer_positive_amounts_check"
    CHECK ("amountOriginal" > 0 AND "amountSettlement" > 0);

ALTER TABLE "ExpenseShare"
  ADD CONSTRAINT "ExpenseShare_positive_amounts_check"
    CHECK ("shareOriginalAmount" > 0 AND "shareSettlementAmount" > 0),
  ADD CONSTRAINT "ExpenseShare_distinct_participants_check"
    CHECK ("debtorUserId" <> "creditorUserId"),
  ADD CONSTRAINT "ExpenseShare_percentage_range_check"
    CHECK ("percentage" IS NULL OR ("percentage" > 0 AND "percentage" <= 100)),
  ADD CONSTRAINT "ExpenseShare_positive_share_units_check"
    CHECK ("shareUnits" IS NULL OR "shareUnits" > 0);

ALTER TABLE "DebtObligation"
  ADD CONSTRAINT "DebtObligation_positive_amounts_check"
    CHECK ("originalAmount" > 0 AND "settlementAmount" > 0),
  ADD CONSTRAINT "DebtObligation_remaining_amount_bounds_check"
    CHECK ("remainingAmount" >= 0 AND "remainingAmount" <= "settlementAmount"),
  ADD CONSTRAINT "DebtObligation_distinct_participants_check"
    CHECK ("debtorUserId" <> "creditorUserId");

ALTER TABLE "Settlement"
  ADD CONSTRAINT "Settlement_positive_amount_check"
    CHECK ("amount" > 0),
  ADD CONSTRAINT "Settlement_distinct_participants_check"
    CHECK ("payerUserId" <> "payeeUserId");

ALTER TABLE "SettlementAllocation"
  ADD CONSTRAINT "SettlementAllocation_positive_amount_check"
    CHECK ("amountApplied" > 0);

ALTER TABLE "RecurringExpenseTemplate"
  ADD CONSTRAINT "RecurringExpenseTemplate_positive_amount_check"
    CHECK ("originalAmount" > 0),
  ADD CONSTRAINT "RecurringExpenseTemplate_positive_fx_rate_check"
    CHECK ("fxRate" IS NULL OR "fxRate" > 0);
