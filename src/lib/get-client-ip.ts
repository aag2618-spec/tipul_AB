// src/lib/get-client-ip.ts
// Stage 1.19 — central client-IP extraction for rate-limit/audit.
//
// Render places the app behind exactly one trusted proxy. The X-Forwarded-For
// header is a comma-separated list of `client, proxy1, proxy2…`. The
// left-most entry is the IP the client claimed (spoofable), while the
// right-most entry is the IP Render's proxy actually saw.
//
// We trust the LAST IP in the chain (right-most), because that's the IP the
// trusted proxy reports. Anything to its left is attacker-controlled.

import type { NextRequest } from "next/server";

const UNKNOWN = "unknown";

/**
 * Extract the rate-limit-safe client IP from a request.
 *  - Prefers the rightmost entry of `x-forwarded-for` (the trusted proxy hop).
 *  - Falls back to `x-real-ip`, then `unknown`.
 *  - Never trusts attacker-supplied left-most XFF (was the previous behavior).
 */
export function getClientIp(request: NextRequest | Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const trusted = parts[parts.length - 1];
    if (trusted) return trusted;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim() || UNKNOWN;
  return UNKNOWN;
}
