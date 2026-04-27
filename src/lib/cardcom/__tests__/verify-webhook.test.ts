import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyWebhookSignature,
  verifyWebhookTimestamp,
  resolveClientIp,
  scrubCardcomMessage,
  capAsmachta,
  isCardcomIp,
} from "../verify-webhook";

describe("verifyWebhookSignature", () => {
  const secret = "shared-secret-123";
  const body = JSON.stringify({ LowProfileId: "abc", ResponseCode: 0 });

  it("accepts a correct HMAC", () => {
    const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("rejects a wrong HMAC", () => {
    expect(verifyWebhookSignature(body, "deadbeef".repeat(8), secret)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it("strips a sha256= prefix", () => {
    const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyWebhookSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });
});

describe("verifyWebhookTimestamp", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = originalEnv;
    delete process.env.CARDCOM_REQUIRE_WEBHOOK_TIMESTAMP;
  });

  it("accepts a recent timestamp", () => {
    expect(verifyWebhookTimestamp(new Date().toISOString())).toBe(true);
  });

  it("rejects a stale timestamp (>5 minutes)", () => {
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    expect(verifyWebhookTimestamp(old)).toBe(false);
  });

  it("rejects a future timestamp (>5 minutes ahead)", () => {
    const future = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    expect(verifyWebhookTimestamp(future)).toBe(false);
  });

  it("tolerates missing timestamp in development", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
    expect(verifyWebhookTimestamp(undefined)).toBe(true);
  });

  it("rejects missing timestamp in production", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    expect(verifyWebhookTimestamp(undefined)).toBe(false);
  });
});

describe("resolveClientIp", () => {
  it("returns the rightmost IP for trusted_proxy_hops=1", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(resolveClientIp(headers)).toBe("2.2.2.2");
  });

  it("falls back to x-real-ip when XFF is missing", () => {
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(resolveClientIp(headers)).toBe("9.9.9.9");
  });

  it("returns null when nothing is present", () => {
    expect(resolveClientIp(new Headers())).toBeNull();
  });
});

describe("scrubCardcomMessage", () => {
  it("redacts a 16-digit PAN", () => {
    const out = scrubCardcomMessage("card 4580458045804580 declined");
    expect(out).not.toContain("4580458045804580");
    expect(out).toContain("[card-redacted]");
  });

  it("redacts spaced PAN", () => {
    const out = scrubCardcomMessage("4580 4580 4580 4580");
    expect(out).toContain("[card-redacted]");
  });

  it("leaves short numbers alone", () => {
    const out = scrubCardcomMessage("amount 250 not enough");
    expect(out).toBe("amount 250 not enough");
  });

  it("returns null for null input", () => {
    expect(scrubCardcomMessage(null)).toBeNull();
  });

  it("caps at 500 chars", () => {
    const long = "x".repeat(1000);
    expect(scrubCardcomMessage(long)?.length).toBe(500);
  });
});

describe("capAsmachta", () => {
  it("leaves a short key untouched", () => {
    expect(capAsmachta("r:abc:99.99")).toBe("r:abc:99.99");
  });

  it("caps a long key to 30 chars", () => {
    const long = "r:" + "x".repeat(80);
    const out = capAsmachta(long);
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it("yields different results for different long inputs", () => {
    const a = capAsmachta("r:tx_aaaaaaaaaaaaaaaaaaaaaaa:50.00");
    const b = capAsmachta("r:tx_aaaaaaaaaaaaaaaaaaaaaaa:99.00");
    expect(a).not.toBe(b);
  });
});

describe("isCardcomIp", () => {
  const original = process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST;
  beforeEach(() => {
    delete process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST;
  });
  afterEach(() => {
    if (original) process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST = original;
    else delete process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST;
  });

  it("accepts an IP on the allowlist", () => {
    process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST = "1.2.3.4,5.6.7.8";
    expect(isCardcomIp("1.2.3.4")).toBe(true);
  });

  it("rejects an IP not on the allowlist", () => {
    process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST = "1.2.3.4";
    expect(isCardcomIp("9.9.9.9")).toBe(false);
  });

  it("permits all in dev when allowlist is empty", () => {
    const origNodeEnv = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
    try {
      expect(isCardcomIp("9.9.9.9")).toBe(true);
    } finally {
      (process.env as { NODE_ENV?: string }).NODE_ENV = origNodeEnv;
    }
  });

  it("fail-closed in prod when allowlist is empty", () => {
    const origNodeEnv = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    try {
      expect(isCardcomIp("9.9.9.9")).toBe(false);
    } finally {
      (process.env as { NODE_ENV?: string }).NODE_ENV = origNodeEnv;
    }
  });
});
