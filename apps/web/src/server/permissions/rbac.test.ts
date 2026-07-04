import { describe, expect, it } from "vitest";
import { canManageMembers, canTransferOwnership, canViewHousehold } from "./rbac";

describe("household RBAC", () => {
  it("allows every active role to view household-scoped data", () => {
    expect(canViewHousehold("OWNER")).toBe(true);
    expect(canViewHousehold("ADMIN")).toBe(true);
    expect(canViewHousehold("MEMBER")).toBe(true);
    expect(canViewHousehold("VIEWER")).toBe(true);
  });

  it("limits member management to owners and admins", () => {
    expect(canManageMembers("OWNER")).toBe(true);
    expect(canManageMembers("ADMIN")).toBe(true);
    expect(canManageMembers("MEMBER")).toBe(false);
    expect(canManageMembers("VIEWER")).toBe(false);
  });

  it("limits ownership transfer to owners", () => {
    expect(canTransferOwnership("OWNER")).toBe(true);
    expect(canTransferOwnership("ADMIN")).toBe(false);
    expect(canTransferOwnership("MEMBER")).toBe(false);
    expect(canTransferOwnership("VIEWER")).toBe(false);
  });
});
