# HANDOFF — Security Round 20 (2026-05-25)

## מקור: סריקת אבטחה eslint-plugin-security + npm audit + CodeQL

---

## 1. טסטים שבורים (4 קבצים) — done

| # | קובץ | בעיה | סטטוס |
|---|-------|------|--------|
| 1a | `src/lib/__tests__/effective-price.test.ts` | הוסף `vi.mock("@/lib/prisma")` לפני import | done |
| 1b | `src/lib/__tests__/scope.test.ts` | הוסף `vi.mock("@/lib/prisma")` לפני import | done |
| 1c | `src/lib/__tests__/sms-quota.test.ts` | הוסף `vi.mock("@/lib/prisma")` + `vi.mock("@/lib/logger")` | done |
| 1d | `src/lib/__tests__/impersonation.test.ts` | הוסף `role: "CLINIC_OWNER"` + `clinicRole: "OWNER"` ל-mock impersonator (H16 check) | done |

## 2. npm vulnerabilities (11→8 moderate)

| # | חבילה | דרך | סטטוס |
|---|--------|-----|--------|
| 2a | dompurify@2.5.9 (7 XSS) | jspdf 2.5.2→4.2.1, jspdf-autotable 3.8.4→5.0.8 | done — 7 פגיעויות תוקנו |
| 2b | postcss | next@16.2.6 | skipped — ממתין ל-Next.js |
| 2c | uuid | next-auth, exceljs | skipped — ממתין לעדכון |
| 2d | @hono/node-server | prisma@7.2.0 | skipped — ממתין ל-Prisma |

## 3. CodeQL (~207 alerts)

### High (5 alerts)

| # | ממצא | קובץ | סטטוס |
|---|------|------|--------|
| 3a | hashApiKey SHA-256 fallback → HMAC-only | src/lib/encryption.ts:119 | done |
| 3b | console.error → logger | src/lib/resend.ts | done (צ'אט קודם) |
| 3c | strip-tags → DOMPurify stripHtmlTags | src/lib/resend.ts | done (צ'אט קודם) |

### Medium/Low (~200 alerts — false positives)

| # | ממצא | סטטוס |
|---|------|--------|
| 3d | escapeHtml "incomplete multi-char sanitization" ×200 | done — CodeQL config exclusion |
| 3e | עדכון CodeQL workflow לשימוש ב-config | done |

---

## 4. Rate Limits חסרים (נמצא במיפוי 2026-05-26)

| # | Endpoint | Auth | סטטוס |
|---|----------|------|--------|
| 4a | `/api/webhooks/meshulam` | signature verification | done — כבר היה |
| 4b | `/api/webhooks/resend` | signature verification | done — הוספתי WEBHOOK_RATE_LIMIT |
| 4c | `/api/webhooks/sumit` | signature verification | done — כבר היה |
| 4d | `/api/webhooks/pulseem` | signature verification | done — הוספתי WEBHOOK_RATE_LIMIT |
| 4e | `/api/webhooks/render` | signature verification | done — הוספתי WEBHOOK_RATE_LIMIT |
| 4f | `/api/auth/2fa/check-required` | partial session | done — כבר היה |
| 4g | `/api/auth/block-info` | getServerSession | done — הוספתי API_RATE_LIMIT |
| 4h | `/api/download/logo-preview` | none | done — הוספתי API_RATE_LIMIT |
| 4i | `/api/p/departure-choice/[token]` | token-based | done — כבר היה |

## 5. Cookie Verification

| # | בדיקה | סטטוס |
|---|--------|--------|
| 5a | אימות HttpOnly, Secure, SameSite על session cookies | done — httpOnly:true, sameSite:strict, secure:true, __Secure- prefix |

## 6. Render Dashboard (user action)

| # | פעולה | סטטוס |
|---|--------|--------|
| 6a | `CARDCOM_WEBHOOK_IP_ALLOWLIST` — להגדיר | skipped — user |
| 6b | `SETUP_ENABLED` — לוודא כבוי | skipped — user |

---

## אימות
- `npx tsc --noEmit` — נקי
- `npx vitest run` — 34 passed, 656 tests passed, 0 failed
- `npm audit` — 8 moderate (כולן תלויות עקיפות, לא ניתנות לתיקון בלי breaking changes)
