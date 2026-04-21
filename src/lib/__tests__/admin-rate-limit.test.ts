/**
 * Unit tests — admin rate-limit helpers (Stage 1.8)
 */

import { describe, it, expect } from "vitest";
import {
  getAdminRateLimitTier,
  getAdminRateLimitKey,
  ADMIN_RATE_LIMIT_BY_TIER,
} from "../rate-limit";

describe("getAdminRateLimitTier", () => {
  it("GET → read", () => {
    expect(getAdminRateLimitTier("/api/admin/users", "GET")).toBe("read");
    expect(getAdminRateLimitTier("/api/admin/stats", "GET")).toBe("read");
    expect(getAdminRateLimitTier("/api/admin/users/abc/toggle-block", "GET")).toBe("read");
  });

  it("POST/PATCH/DELETE on /users/* → sensitive", () => {
    expect(getAdminRateLimitTier("/api/admin/users/abc", "PATCH")).toBe("sensitive");
    expect(getAdminRateLimitTier("/api/admin/users/abc", "DELETE")).toBe("sensitive");
    expect(getAdminRateLimitTier("/api/admin/users/abc/add-package", "POST")).toBe("sensitive");
    expect(getAdminRateLimitTier("/api/admin/users/abc/toggle-block", "POST")).toBe("sensitive");
  });

  it("POST /set-admin → sensitive", () => {
    expect(getAdminRateLimitTier("/api/admin/set-admin", "POST")).toBe("sensitive");
  });

  it("DELETE /idempotency → sensitive", () => {
    expect(getAdminRateLimitTier("/api/admin/idempotency", "DELETE")).toBe("sensitive");
  });

  it("POST /coupons → write (not sensitive)", () => {
    expect(getAdminRateLimitTier("/api/admin/coupons", "POST")).toBe("write");
  });

  it("PUT /billing/abc → write", () => {
    expect(getAdminRateLimitTier("/api/admin/billing/abc", "PUT")).toBe("write");
  });
});

describe("getAdminRateLimitKey", () => {
  it("read tier → adminId only", () => {
    expect(getAdminRateLimitKey("/api/admin/users", "admin-123", "read")).toBe(
      "admin-123"
    );
  });

  it("write tier → adminId only", () => {
    expect(
      getAdminRateLimitKey("/api/admin/coupons", "admin-123", "write")
    ).toBe("admin-123");
  });

  it("sensitive with user target → adminId:targetUserId", () => {
    expect(
      getAdminRateLimitKey(
        "/api/admin/users/user-abc/add-package",
        "admin-123",
        "sensitive"
      )
    ).toBe("admin-123:user-abc");
  });

  it("sensitive PATCH on user → adminId:targetUserId", () => {
    expect(
      getAdminRateLimitKey("/api/admin/users/user-xyz", "admin-123", "sensitive")
    ).toBe("admin-123:user-xyz");
  });

  it("sensitive without user target → global fallback", () => {
    expect(
      getAdminRateLimitKey("/api/admin/set-admin", "admin-123", "sensitive")
    ).toBe("admin-123:global");
  });
});

describe("ADMIN_RATE_LIMIT_BY_TIER", () => {
  it("read = 60/min", () => {
    expect(ADMIN_RATE_LIMIT_BY_TIER.read.maxRequests).toBe(60);
    expect(ADMIN_RATE_LIMIT_BY_TIER.read.windowMs).toBe(60_000);
  });

  it("write = 20/min", () => {
    expect(ADMIN_RATE_LIMIT_BY_TIER.write.maxRequests).toBe(20);
    expect(ADMIN_RATE_LIMIT_BY_TIER.write.windowMs).toBe(60_000);
  });

  it("sensitive = 5/min", () => {
    expect(ADMIN_RATE_LIMIT_BY_TIER.sensitive.maxRequests).toBe(5);
    expect(ADMIN_RATE_LIMIT_BY_TIER.sensitive.windowMs).toBe(60_000);
  });
});
