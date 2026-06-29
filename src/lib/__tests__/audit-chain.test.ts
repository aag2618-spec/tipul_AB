// בדיקות יחידה — src/lib/audit-chain.ts (שרשרת חתימות audit, גישה ב')
//
// פונקציות טהורות בלבד (אין DB) → נבדקות ישירות. מכסה: דטרמיניזם, הבחנה בין
// null למחרוזת ריקה, חישוב שרשרת תקין, זיהוי עריכת תוכן, זיהוי מחיקה באמצע,
// סבילות ל-head-gap (retention), דילוג על שורות לא-חתומות, ו-pagination.

import { describe, it, expect } from "vitest";
import {
  canonicalizeDataAccessRow,
  canonicalizeAdminAuditRow,
  computeRowHash,
  verifyOrderedChain,
  type DataAccessRowForHash,
  type HashedRow,
} from "../audit-chain";

// ─── עזרי בנייה ─────────────────────────────────────────────────────────────

function makeRow(i: number, overrides: Partial<DataAccessRowForHash> = {}): DataAccessRowForHash {
  return {
    id: `id-${i}`,
    userId: `user-${i}`,
    userEmail: `u${i}@x.com`,
    userName: `name ${i}`,
    recordType: "SESSION_NOTE",
    recordId: `rec-${i}`,
    action: "READ",
    clientId: `client-${i}`,
    ipAddress: "1.2.3.4",
    userAgent: "agent",
    meta: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    ...overrides,
  };
}

/** בונה שרשרת חתומה תקינה משורות (כפי שה-cron היה כותב). */
function buildChain(rows: DataAccessRowForHash[]): HashedRow[] {
  let prev: string | null = null;
  const out: HashedRow[] = [];
  for (const r of rows) {
    const canonical = canonicalizeDataAccessRow(r);
    const rowHash = computeRowHash(prev, canonical);
    out.push({ id: r.id, prevHash: prev, rowHash, canonical });
    prev = rowHash;
  }
  return out;
}

// ─── canonicalize ───────────────────────────────────────────────────────────

describe("canonicalize", () => {
  it("דטרמיניסטי — אותה שורה → אותה מחרוזת", () => {
    const r = makeRow(1);
    expect(canonicalizeDataAccessRow(r)).toBe(canonicalizeDataAccessRow(makeRow(1)));
  });

  it("מבחין בין null למחרוזת ריקה (אין בלבול שדות)", () => {
    const withNull = canonicalizeDataAccessRow(makeRow(1, { clientId: null }));
    const withEmpty = canonicalizeDataAccessRow(makeRow(1, { clientId: "" }));
    expect(withNull).not.toBe(withEmpty);
  });

  it("שינוי שדה כלשהו משנה את המחרוזת", () => {
    const base = canonicalizeDataAccessRow(makeRow(1));
    expect(canonicalizeDataAccessRow(makeRow(1, { action: "EXPORT" }))).not.toBe(base);
    expect(canonicalizeDataAccessRow(makeRow(1, { recordId: "other" }))).not.toBe(base);
  });

  it("admin canonicalize עובד ושונה לשורות שונות", () => {
    const a = canonicalizeAdminAuditRow({
      id: "a", action: "block_user", targetType: "user", targetId: "u1",
      details: "{}", adminId: "adm", adminEmail: "a@x.com", adminName: "Adm",
      createdAt: new Date(Date.UTC(2026, 0, 1)),
    });
    const b = canonicalizeAdminAuditRow({
      id: "a", action: "block_user", targetType: "user", targetId: "u2", // שונה
      details: "{}", adminId: "adm", adminEmail: "a@x.com", adminName: "Adm",
      createdAt: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(a).not.toBe(b);
  });
});

// ─── computeRowHash ─────────────────────────────────────────────────────────

describe("computeRowHash", () => {
  it("דטרמיניסטי", () => {
    expect(computeRowHash("p", "c")).toBe(computeRowHash("p", "c"));
  });
  it("תלוי ב-prevHash — אותו תוכן + prev שונה → hash שונה", () => {
    expect(computeRowHash("p1", "c")).not.toBe(computeRowHash("p2", "c"));
  });
  it("prevHash=null שונה מ-prevHash ריק... אך עקבי", () => {
    expect(computeRowHash(null, "c")).toBe(computeRowHash(null, "c"));
  });
});

// ─── verifyOrderedChain ─────────────────────────────────────────────────────

describe("verifyOrderedChain", () => {
  it("שרשרת תקינה → ok, נספרו כל השורות", () => {
    const chain = buildChain([makeRow(0), makeRow(1), makeRow(2), makeRow(3)]);
    const res = verifyOrderedChain(chain);
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(4);
  });

  it("עריכת תוכן (canonical שונה מה-hash) → CONTENT_MISMATCH", () => {
    const chain = buildChain([makeRow(0), makeRow(1), makeRow(2)]);
    // מדמים מישהו ששינה את תוכן השורה האמצעית אחרי החתימה.
    chain[1] = { ...chain[1], canonical: chain[1].canonical + "TAMPERED" };
    const res = verifyOrderedChain(chain);
    expect(res.ok).toBe(false);
    expect(res.brokenAt?.reason).toBe("CONTENT_MISMATCH");
    expect(res.brokenAt?.id).toBe("id-1");
  });

  it("מחיקת שורה באמצע → LINK_MISMATCH בשורה הבאה", () => {
    const chain = buildChain([makeRow(0), makeRow(1), makeRow(2), makeRow(3)]);
    chain.splice(2, 1); // מוחקים את id-2 → prevHash של id-3 כבר לא תואם
    const res = verifyOrderedChain(chain);
    expect(res.ok).toBe(false);
    expect(res.brokenAt?.reason).toBe("LINK_MISMATCH");
    expect(res.brokenAt?.id).toBe("id-3");
  });

  it("head-gap — מחיקת השורות הראשונות (retention) → עדיין ok", () => {
    const chain = buildChain([makeRow(0), makeRow(1), makeRow(2), makeRow(3)]);
    const afterRetention = chain.slice(2); // נשארו id-2, id-3; id-2 מצביע ל-id-1 שנמחק
    const res = verifyOrderedChain(afterRetention);
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(2);
  });

  it("שורות לא-חתומות (rowHash=null) מדולגות ולא שוברות", () => {
    const chain = buildChain([makeRow(0), makeRow(1), makeRow(2)]);
    // מוסיפים שורה חדשה לא-חתומה בסוף (כמו שורה שזה עתה נכנסה).
    chain.push({ id: "id-new", prevHash: null, rowHash: null, canonical: "whatever" });
    const res = verifyOrderedChain(chain);
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(3); // הלא-חתומה לא נספרה
  });

  it("pagination — אימות מפוצל לשני עמודים שקול לאימות מלא", () => {
    const chain = buildChain([makeRow(0), makeRow(1), makeRow(2), makeRow(3), makeRow(4)]);
    const page1 = chain.slice(0, 3);
    const page2 = chain.slice(3);
    const r1 = verifyOrderedChain(page1);
    expect(r1.ok).toBe(true);
    const r2 = verifyOrderedChain(page2, { initialPrev: r1.endPrev });
    expect(r2.ok).toBe(true);
    expect(r1.checked + r2.checked).toBe(5);
  });

  it("pagination תופס שבירה בגבול העמוד (לא false-negative)", () => {
    const chain = buildChain([makeRow(0), makeRow(1), makeRow(2), makeRow(3)]);
    // מוחקים את השורה האחרונה של עמוד 1 → שבירת link בתחילת עמוד 2.
    const page1 = chain.slice(0, 2); // id-0, id-1
    const page2 = chain.slice(3); // id-3 (id-2 "נמחק")
    const r1 = verifyOrderedChain(page1);
    expect(r1.ok).toBe(true);
    const r2 = verifyOrderedChain(page2, { initialPrev: r1.endPrev });
    expect(r2.ok).toBe(false);
    expect(r2.brokenAt?.reason).toBe("LINK_MISMATCH");
  });

  it("שרשרת ריקה → ok, checked=0", () => {
    const res = verifyOrderedChain([]);
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(0);
    expect(res.endPrev).toBeNull();
  });
});
