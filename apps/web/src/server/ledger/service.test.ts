import { describe, expect, it } from "vitest";
import { computeSettlementSuggestions } from "./service";

describe("computeSettlementSuggestions", () => {
  it("minimizes chained obligations into direct transfers", () => {
    const suggestions = computeSettlementSuggestions([
      {
        debtorUserId: "alice",
        creditorUserId: "bob",
        remainingAmount: "10",
        settlementCurrency: "CNY",
      },
      {
        debtorUserId: "bob",
        creditorUserId: "chen",
        remainingAmount: "10",
        settlementCurrency: "CNY",
      },
    ]);

    expect(suggestions).toEqual([
      {
        debtorUserId: "alice",
        creditorUserId: "chen",
        amount: "10",
        currency: "CNY",
        debtorOpenObligationCount: 1,
        creditorOpenObligationCount: 1,
        directOpenObligationCount: 0,
        directRemainingAmount: "0",
        actionability: "GUIDANCE_ONLY",
      },
    ]);
  });

  it("nets reciprocal obligations and keeps currencies separate", () => {
    const suggestions = computeSettlementSuggestions([
      {
        debtorUserId: "alice",
        creditorUserId: "bob",
        remainingAmount: "12.500000",
        settlementCurrency: "CNY",
      },
      {
        debtorUserId: "bob",
        creditorUserId: "alice",
        remainingAmount: "2.5",
        settlementCurrency: "CNY",
      },
      {
        debtorUserId: "alice",
        creditorUserId: "bob",
        remainingAmount: "3",
        settlementCurrency: "USD",
      },
    ]);

    expect(suggestions).toEqual([
      {
        debtorUserId: "alice",
        creditorUserId: "bob",
        amount: "10",
        currency: "CNY",
        debtorOpenObligationCount: 1,
        creditorOpenObligationCount: 1,
        directOpenObligationCount: 1,
        directRemainingAmount: "12.5",
        actionability: "DIRECTLY_SETTLEABLE",
      },
      {
        debtorUserId: "alice",
        creditorUserId: "bob",
        amount: "3",
        currency: "USD",
        debtorOpenObligationCount: 1,
        creditorOpenObligationCount: 1,
        directOpenObligationCount: 1,
        directRemainingAmount: "3",
        actionability: "DIRECTLY_SETTLEABLE",
      },
    ]);
  });
});
