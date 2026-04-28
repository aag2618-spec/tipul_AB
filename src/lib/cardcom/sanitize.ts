// src/lib/cardcom/sanitize.ts
// Stage 1.19 — central deep-redaction for Cardcom payloads written to DB.
// Recursively walks objects/arrays and replaces sensitive values with
// "[redacted]". Last4 / masked PAN / expiry remain (needed for reconciliation).

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /apipassword/i,
  /apiname/i,
  /apikey/i,
  /^password$/i,
  /\bcvv2?\b/i,
  /^cardnumber$/i,
  /^pan$/i,
  /^fullpan$/i,
  /\bidnumber\b/i,
];

// Additional PII keys redacted for ChargebackEvent records, which are kept
// long-term for legal/audit and don't need cardholder identifying details
// (the link to the user is already via cardcomTransactionId → userId).
//
// `^token$` is included because the LowProfile token is itself a billing
// credential (reusable for future charges) — already encrypted in the
// dedicated `SavedCardToken` table, so there's no need to keep it in the
// long-lived chargeback audit row.
const CHARGEBACK_PII_KEY_PATTERNS: RegExp[] = [
  /cardownername/i,
  /cardownerphone/i,
  /cardowneremail/i,
  /^ownername$/i,
  /^ownerphone$/i,
  /^owneremail$/i,
  /\bphone\b/i,
  /\bemail\b/i,
  /\bfullname\b/i,
  /^token$/i,
];

const MAX_DEPTH = 8;

function makeKeyMatcher(patterns: RegExp[]): (key: string) => boolean {
  return (key: string) => patterns.some((re) => re.test(key));
}

const shouldRedactSensitive = makeKeyMatcher(SENSITIVE_KEY_PATTERNS);
const shouldRedactChargeback = makeKeyMatcher([
  ...SENSITIVE_KEY_PATTERNS,
  ...CHARGEBACK_PII_KEY_PATTERNS,
]);

function deepRedact(
  value: unknown,
  shouldRedact: (key: string) => boolean,
  depth = 0
): unknown {
  if (depth > MAX_DEPTH) return "[depth-limit]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => deepRedact(v, shouldRedact, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = shouldRedact(k) ? "[redacted]" : deepRedact(v, shouldRedact, depth + 1);
  }
  return out;
}

/**
 * Deep-redact a Cardcom payload before persisting it to the DB
 * (rawResponse / rawPayload columns) or sending to logs.
 */
export function sanitizeCardcomPayload<T extends object>(payload: T): object {
  return deepRedact(payload, shouldRedactSensitive) as object;
}

/**
 * Stricter scrub for ChargebackEvent.rawPayload — also redacts cardholder
 * PII (name/phone/email). Chargebacks live in DB long-term for legal/audit,
 * and the link to the user remains via `cardcomTransactionId` → User FK.
 */
export function sanitizeChargebackPayload<T extends object>(payload: T): object {
  return deepRedact(payload, shouldRedactChargeback) as object;
}
