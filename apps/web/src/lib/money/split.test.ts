import { describe, expect, it } from "vitest";
import { splitByWeights, splitEqual } from "./split";

describe("splitEqual", () => {
  it("distributes remainder cents without floating-point drift", () => {
    const result = splitEqual({ amount: "10.00", participants: 3 });

    expect(result.shares).toEqual(["3.34", "3.33", "3.33"]);
    expect(result.total).toBe("10.00");
  });

  it("handles tiny amounts deterministically", () => {
    const result = splitEqual({ amount: "0.05", participants: 4 });

    expect(result.shares).toEqual(["0.02", "0.01", "0.01", "0.01"]);
    expect(result.total).toBe("0.05");
  });

  it("rejects invalid participant counts", () => {
    expect(() => splitEqual({ amount: "12.00", participants: 0 })).toThrow(
      "participants must be a positive integer",
    );
  });
});

describe("splitByWeights", () => {
  it("allocates by percentage-like weights and preserves total", () => {
    const result = splitByWeights({ amount: "100.00", weights: ["25", "25", "50"] });

    expect(result.shares).toEqual(["25.00", "25.00", "50.00"]);
    expect(result.total).toBe("100.00");
  });

  it("distributes weighted rounding remainders deterministically", () => {
    const result = splitByWeights({ amount: "0.05", weights: ["1", "1", "1"] });

    expect(result.shares).toEqual(["0.02", "0.02", "0.01"]);
    expect(result.total).toBe("0.05");
  });

  it("rejects all-zero weights", () => {
    expect(() => splitByWeights({ amount: "10.00", weights: ["0", "0"] })).toThrow(
      "at least one weight must be greater than zero",
    );
  });
});
