import { describe, expect, it } from "vitest";
import { splitEqual } from "./split";

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
