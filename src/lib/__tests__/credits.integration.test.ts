/**
 * Concurrency integration tests — Stage 1.16
 *
 * ⚠️  דורש Postgres אמיתי — לא נריץ בפייפליין ברירת מחדל.
 *
 * הטסטים האלה מדלגים כאשר INTEGRATION_DB_URL לא מוגדר, כדי שהם
 * יעברו לוקאלית רק כאשר המפעיל החליט מראש להרים Docker Postgres
 * ייעודי.
 *
 * הרצה ידנית:
 *   docker run -d --name tipul-pg-test -e POSTGRES_PASSWORD=test \
 *       -p 55432:5432 postgres:15
 *   INTEGRATION_DB_URL=postgresql://postgres:test@localhost:55432/postgres \
 *       npx vitest run src/lib/__tests__/credits.integration.test.ts
 *
 * שלושת המקרים שנבדקים:
 *   1. SELECT FOR UPDATE מונע race בין שני consumeSms מקבילים —
 *      סכום ה-fromMonthly לא עולה על smsMonthlyQuota.
 *   2. retry על 40001 (serialization failure) — שני Serializable
 *      writes במקביל → אחד יצליח, השני יעבור retry.
 *   3. retry על 40P01 (deadlock) — שני כתבים שמנעילים בסדר הפוך.
 *
 * הטסטים האלה עדיין WIP — משולבים ב-Stage 1.16 עם תשתית docker-compose.test.yml
 * שתיכתב בסבב הבא.
 */

import { describe, it } from "vitest";

// it.todo מסמן WIP בפורמט רשמי — הרצה לא מתבצעת, reporter מסמן "pending".
// נמנע מ-false positives של expect(true).toBe(true) (Cursor M-R2-3 סיבוב 2).

describe("credits concurrency (integration)", () => {
  it.todo("FOR UPDATE prevents monthly over-consume");
  it.todo("retries on serialization failure (40001)");
  it.todo("retries on deadlock (40P01)");
});

describe("withIdempotency concurrency (integration)", () => {
  it.todo("two concurrent POSTs with same key → only one fn execution, same response");
});
