/**
 * Unit tests — src/lib/permissions.ts (Stage 1.1)
 */

import { describe, it, expect } from "vitest";
import {
  hasPermission,
  highestPermission,
  PERMISSIONS_BY_ROLE,
  PERMISSION_RANK,
  type Permission,
} from "../permissions";

describe("hasPermission", () => {
  it("USER has no permissions", () => {
    expect(hasPermission("USER", "users.view")).toBe(false);
    expect(hasPermission("USER", "users.block")).toBe(false);
  });

  it("MANAGER has MANAGER permissions", () => {
    expect(hasPermission("MANAGER", "users.view")).toBe(true);
    expect(hasPermission("MANAGER", "users.block")).toBe(true);
    expect(hasPermission("MANAGER", "users.grant_free_30d")).toBe(true);
    expect(hasPermission("MANAGER", "support.respond")).toBe(true);
  });

  it("MANAGER does NOT have ADMIN-only permissions", () => {
    expect(hasPermission("MANAGER", "users.change_role")).toBe(false);
    expect(hasPermission("MANAGER", "users.delete")).toBe(false);
    expect(hasPermission("MANAGER", "users.grant_free_unlimited")).toBe(false);
    expect(hasPermission("MANAGER", "settings.pricing")).toBe(false);
    expect(hasPermission("MANAGER", "payments.refund")).toBe(false);
    expect(hasPermission("MANAGER", "idempotency.clear")).toBe(false);
  });

  it("ADMIN has all permissions (including ADMIN-only)", () => {
    expect(hasPermission("ADMIN", "users.view")).toBe(true);
    expect(hasPermission("ADMIN", "users.block")).toBe(true);
    expect(hasPermission("ADMIN", "users.change_role")).toBe(true);
    expect(hasPermission("ADMIN", "users.delete")).toBe(true);
    expect(hasPermission("ADMIN", "settings.pricing")).toBe(true);
    expect(hasPermission("ADMIN", "idempotency.clear")).toBe(true);
  });
});

describe("PERMISSION_RANK", () => {
  it("reads are rank 0-1", () => {
    expect(PERMISSION_RANK["users.view"]).toBe(0);
    expect(PERMISSION_RANK["users.update_basic"]).toBe(1);
  });

  it("MANAGER writes are rank 2-3", () => {
    expect(PERMISSION_RANK["users.block"]).toBe(2);
    expect(PERMISSION_RANK["users.change_tier"]).toBe(3);
  });

  it("ADMIN-only permissions are rank 10", () => {
    expect(PERMISSION_RANK["users.change_role"]).toBe(10);
    expect(PERMISSION_RANK["users.delete"]).toBe(10);
    expect(PERMISSION_RANK["users.grant_free_unlimited"]).toBe(10);
    expect(PERMISSION_RANK["settings.pricing"]).toBe(10);
  });
});

describe("highestPermission", () => {
  it("returns single permission unchanged", () => {
    expect(highestPermission(["users.view"])).toBe("users.view");
  });

  it("returns highest-ranked from multiple", () => {
    const result = highestPermission([
      "users.view", // 0
      "users.block", // 2
      "users.change_tier", // 3
    ]);
    expect(result).toBe("users.change_tier");
  });

  it("ADMIN-only beats MANAGER permissions", () => {
    const result = highestPermission([
      "users.change_tier", // 3
      "users.change_role", // 10 (ADMIN only)
    ]);
    expect(result).toBe("users.change_role");
  });

  it("grantFree with days>30 is ADMIN-only", () => {
    // Simulates: body = {grantFree: true, subscriptionEndsAt: +60d, aiTier: "PRO"}
    const result = highestPermission([
      "users.grant_free_unlimited", // 10
      "users.change_tier", // 3
    ]);
    expect(result).toBe("users.grant_free_unlimited");
  });

  it("grantFree with days<=30 stays MANAGER", () => {
    // Simulates: body = {grantFree: true, subscriptionEndsAt: +15d, aiTier: "PRO"}
    const result = highestPermission([
      "users.grant_free_30d", // 3
      "users.change_tier", // 3
    ]);
    // Either is fine — both rank 3. The function returns the first one.
    expect([
      "users.grant_free_30d",
      "users.change_tier",
    ]).toContain(result);
  });

  it("throws on empty list", () => {
    expect(() => highestPermission([])).toThrow();
  });
});

describe("PERMISSIONS_BY_ROLE consistency", () => {
  it("all MANAGER permissions exist in PERMISSION_RANK", () => {
    for (const perm of PERMISSIONS_BY_ROLE.MANAGER) {
      expect(PERMISSION_RANK[perm]).toBeDefined();
    }
  });

  it("MANAGER never has rank-10 permissions", () => {
    for (const perm of PERMISSIONS_BY_ROLE.MANAGER) {
      expect(PERMISSION_RANK[perm]).toBeLessThan(10);
    }
  });

  it("USER has no permissions at all", () => {
    expect(PERMISSIONS_BY_ROLE.USER).toEqual([]);
  });

  it("MANAGER has 22 permissions", () => {
    expect(PERMISSIONS_BY_ROLE.MANAGER.length).toBe(22);
  });
});
