// src/lib/cardcom/verify-webhook.ts
// Webhook signature + timestamp verification.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '@/lib/logger';

/** Allow webhooks at most 5 minutes old (anti-replay). */
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;

/**
 * Verify HMAC-SHA256 signature on the raw webhook body.
 * Cardcom signs with the webhookSecret configured per-terminal.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature.toLowerCase().replace(/^sha256=/, ''), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (err) {
    logger.warn('[Cardcom] verifyWebhookSignature error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Reject webhooks whose Timestamp is more than 5 minutes off.
 *
 * Behavior on missing Timestamp:
 *  - production: rejects (HMAC alone allows replay of an intercepted body).
 *  - dev/test: tolerates (Cardcom sandbox sometimes omits the field).
 *
 * Once Cardcom confirms whether their webhook payload always carries a
 * Timestamp, set CARDCOM_REQUIRE_WEBHOOK_TIMESTAMP=true to fail closed.
 */
export function verifyWebhookTimestamp(timestamp: string | undefined): boolean {
  if (!timestamp) {
    const required =
      process.env.CARDCOM_REQUIRE_WEBHOOK_TIMESTAMP === 'true' ||
      process.env.NODE_ENV === 'production';
    if (required) {
      logger.warn('[Cardcom] missing Timestamp on webhook (rejected)');
      return false;
    }
    return true;
  }
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  const age = Date.now() - t;
  return age >= -MAX_WEBHOOK_AGE_MS && age <= MAX_WEBHOOK_AGE_MS;
}

/**
 * Normalize a Cardcom webhook / GetLpResult payload so all string-typed DB
 * columns receive strings even when Cardcom returns numbers.
 *
 * **Background:** Cardcom's LowProfile v11 occasionally returns numeric
 * values for fields the OpenAPI documents as strings (e.g. sandbox terminals
 * have been observed returning `TranzactionId: 248402990` as an Int and
 * `Last4CardDigits: 8` as an Int). Our Prisma schema declares these as
 * `String?` — passing a number triggers
 * `Invalid value provided. Expected String ... provided Int.` mid-transaction,
 * which rolls the whole webhook back.
 *
 * Centralizing the normalization here means every DB-writing site in the
 * webhook handlers can trust the types without local `String(...)` calls.
 *
 * Notes:
 *   - `Last4CardDigits` is pad-zeroed to 4 chars so an Int `8` becomes "0008"
 *     (matching what Cardcom's `Last4CardDigitsString` field would have given).
 *   - `DocumentNumber` / `AllocationNumber` are kept as-is here because the
 *     existing callers already do explicit `String(...)` coercion at use sites.
 */
export function normalizeCardcomPayload<T extends object>(fetched: T): T {
  const out = { ...fetched } as Record<string, unknown>;

  const tx = (fetched as { TranzactionId?: unknown }).TranzactionId;
  if (tx !== undefined && tx !== null && tx !== "") {
    out.TranzactionId = String(tx);
  }

  const info = (fetched as { TranzactionInfo?: Record<string, unknown> })
    .TranzactionInfo;
  if (info && typeof info === "object") {
    const normInfo: Record<string, unknown> = { ...info };

    const last4 = info.Last4CardDigits;
    const last4Str = (info as { Last4CardDigitsString?: unknown })
      .Last4CardDigitsString;
    if (typeof last4Str === "string" && last4Str.length > 0) {
      normInfo.Last4CardDigits = last4Str;
    } else if (last4 !== undefined && last4 !== null && last4 !== "") {
      normInfo.Last4CardDigits = String(last4).padStart(4, "0");
    }

    const approval = info.ApprovalNumber;
    if (approval !== undefined && approval !== null && approval !== "") {
      normInfo.ApprovalNumber = String(approval);
    }

    out.TranzactionInfo = normInfo;
  }

  return out as T;
}

/**
 * Strip sensitive fragments from a free-text Cardcom message before persisting.
 * Cardcom's `Description` is meant for end-customer display, but in rare cases
 * may include PAN fragments, CVV, email addresses or cardholder names. None
 * should appear in our DB or in pages exposed via referrer leakage.
 *
 * Layers (applied in order):
 *   1. PAN — sequences of 13-19 digits with optional separators.
 *   2. Email — `name@host.tld`.
 *   3. CVV — 3 or 4 stand-alone digits prefixed by "CVV"/"cvc"/"בטיחות".
 *   4. Likely cardholder names — ASCII or Hebrew runs prefixed by
 *      "name"/"בעל הכרטיס" (best-effort).
 * Always errs on the side of over-redacting.
 */
export function scrubCardcomMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message
    // PAN
    // eslint-disable-next-line security/detect-unsafe-regex -- each repetition consumes mandatory \d
    .replace(/\d(?:[ -]?\d){12,18}/g, "[card-redacted]")
    // Email
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email-redacted]")
    // CVV (English + Hebrew context cues)
    .replace(/\b(?:cvv|cvc|בטיחות)\s*[:#]?\s*\d{3,4}\b/gi, "[cvv-redacted]")
    // Cardholder name patterns
    .replace(
      /(?:name|cardholder|בעל הכרטיס|שם בעל הכרטיס)\s*[:#]?\s*[A-Za-z֐-׿][A-Za-z֐-׿ '-]{1,40}/gi,
      "[name-redacted]"
    )
    .slice(0, 500);
}

/**
 * Cap a UniqueAsmachta key to 30 chars to stay within Cardcom's likely max.
 *
 * Uses SHA-256 of the FULL key (truncated to 7 hex = 28 bits) so collisions
 * are uniformly distributed: ~1 in 268M for arbitrary inputs. The earlier
 * polynomial 32-bit non-crypto hash had real collision risk for
 * structured inputs that share a 22-char prefix (e.g. two partial refunds
 * to the same transaction with different amounts).
 *
 * If two distinct keys nevertheless map to the same 30-char output, only the
 * second call to Cardcom would be rejected as duplicate — a recoverable
 * 4xx, not a financial loss.
 */
export function capAsmachta(key: string): string {
  const MAX = 30;
  if (key.length <= MAX) return key;
  const sha = createHash('sha256').update(key, 'utf8').digest('hex');
  // 22 prefix chars (semantically meaningful) + 1 separator + 7 sha hex.
  return key.slice(0, 22) + '-' + sha.slice(0, 7);
}

/**
 * Cardcom IP allowlist for webhook source verification.
 *
 * Production: requires CARDCOM_WEBHOOK_IP_ALLOWLIST env var with comma-separated IPs.
 *             If unset in production, fails closed (returns false).
 * Non-production: permissive when allowlist is empty (development convenience).
 *
 * Always paired with HMAC signature verification — never relied upon alone.
 */
export function isCardcomIp(ip: string | null): boolean {
  if (!ip) return false;

  const allowlistRaw = process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST ?? '';
  const allowlist = allowlistRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowlist.length === 0) {
    // Fail closed in production. In dev/test, permit all (HMAC still required).
    if (process.env.NODE_ENV === 'production') {
      logger.warn('[Cardcom] IP allowlist not configured in production — rejecting webhook IP', { ip });
      return false;
    }
    return true;
  }

  return allowlist.includes(ip);
}

/**
 * Resolve the originating client IP from request headers, taking the proxy
 * trust chain into account.
 *
 * X-Forwarded-For format is `client, proxy1, proxy2`. The LEFT-most entry is
 * what the client claims; everything after is added by trusted proxies.
 *
 * On Render, requests pass through one trusted proxy. The originating IP is
 * therefore the LAST entry the proxy added — but a malicious client can
 * inject `X-Forwarded-For: 91.199.x.x, attacker_ip` so left-most is spoofable.
 *
 * Strategy: read TRUSTED_PROXY_HOPS (default 1 on Render) and pick the IP at
 * `(length - hops)` from the right. If the header has fewer entries than
 * hops, fall back to the leftmost (best effort, but logged).
 */
export function resolveClientIp(headers: { get(name: string): string | null }): string | null {
  const xff = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');

  if (xff) {
    const ips = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (ips.length === 0) return realIp;
    const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? '1');
    const safeHops = Math.max(1, Number.isFinite(hops) ? hops : 1);
    if (ips.length >= safeHops) {
      // Take the IP added by the LAST trusted proxy (rightmost minus hops + 1).
      return ips[ips.length - safeHops] ?? null;
    }
    logger.warn('[Cardcom] X-Forwarded-For shorter than TRUSTED_PROXY_HOPS', {
      header: xff,
      hops: safeHops,
    });
    return ips[0] ?? null;
  }

  return realIp;
}
