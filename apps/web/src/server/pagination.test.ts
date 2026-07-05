import { describe, expect, it } from "vitest";
import { paginateRows } from "@/server/pagination";

describe("pagination helpers", () => {
  it("returns the requested page and next cursor when more rows exist", () => {
    const page = paginateRows([{ id: "a" }, { id: "b" }, { id: "c" }], 2);

    expect(page.items).toEqual([{ id: "a" }, { id: "b" }]);
    expect(page.page).toEqual({
      limit: 2,
      nextCursor: "b",
      hasMore: true,
    });
  });

  it("returns an empty terminal page", () => {
    const page = paginateRows([], 5);

    expect(page.items).toEqual([]);
    expect(page.page).toEqual({
      limit: 5,
      nextCursor: null,
      hasMore: false,
    });
  });
});
