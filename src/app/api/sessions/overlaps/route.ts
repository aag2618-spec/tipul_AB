import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

interface OverlapEntry {
  id: string;
  clientName: string | null;
  startTime: Date;
  endTime: Date;
  therapistId: string;
  therapistName: string | null;
  location: string | null;
}

interface OverlapResult {
  session1: OverlapEntry;
  session2: OverlapEntry;
  /** "self" — אותו מטפל. "clinic_location" — שני מטפלים, אותו מיקום. */
  reason: "self" | "clinic_location";
}

function toEntry(s: {
  id: string;
  startTime: Date;
  endTime: Date;
  therapistId: string;
  type: string;
  location: string | null;
  client: { id: string; name: string } | null;
  therapist: { name: string | null } | null;
}): OverlapEntry {
  return {
    id: s.id,
    clientName: s.client?.name ?? (s.type === "BREAK" ? "הפסקה" : "ללא מטופל"),
    startTime: s.startTime,
    endTime: s.endTime,
    therapistId: s.therapistId,
    therapistName: s.therapist?.name ?? null,
    location: s.location,
  };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    const now = new Date();

    // (1) Self-overlap: כל הפגישות שלי, מיון לפי startTime.
    const mySessions = await prisma.therapySession.findMany({
      where: {
        therapistId: userId,
        status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
      },
      orderBy: { startTime: "asc" },
      include: {
        client: { select: { id: true, name: true } },
        therapist: { select: { name: true } },
      },
    });

    const overlaps: OverlapResult[] = [];
    const seenPair = new Set<string>();

    for (let i = 0; i < mySessions.length; i++) {
      const a = mySessions[i];
      const aEnd = new Date(a.endTime).getTime();
      for (let j = i + 1; j < mySessions.length; j++) {
        const b = mySessions[j];
        const bStart = new Date(b.startTime).getTime();
        if (bStart >= aEnd) break;
        const key = [a.id, b.id].sort().join("|");
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        overlaps.push({
          session1: toEntry(a),
          session2: toEntry(b),
          reason: "self",
        });
      }
    }

    // (2) M5/M11 — cross-therapist clinic overlap על אותו location.
    // רץ רק במצב קליניקה (organizationId !== null). מאתר חפיפות גם בין
    // מטפלים שונים שמשתפים חדר. מקבץ לפי location מנורמלת ומפעיל את אותו
    // אלגוריתם sweep.
    //
    // חלון זמן: -14 ימים עד +90 ימים מעכשיו. בלי חלון, בקליניקות גדולות
    // עם היסטוריה ארוכה findMany היה מושך 10k+ סשנים לזיכרון.
    if (scopeUser.organizationId) {
      const windowStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const clinicSessions = await prisma.therapySession.findMany({
        where: {
          organizationId: scopeUser.organizationId,
          status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
          location: { not: null },
          startTime: { gte: windowStart, lt: windowEnd },
        },
        orderBy: { startTime: "asc" },
        include: {
          client: { select: { id: true, name: true } },
          therapist: { select: { name: true } },
        },
      });

      // קיבוץ לפי location (trim + lowercase) — אותו חדר בכתיב שונה ייחשב זהה.
      const byLocation = new Map<string, typeof clinicSessions>();
      for (const s of clinicSessions) {
        const norm = (s.location ?? "").trim().toLowerCase();
        if (!norm) continue;
        const arr = byLocation.get(norm) ?? [];
        arr.push(s);
        byLocation.set(norm, arr);
      }

      for (const arr of byLocation.values()) {
        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          const aEnd = new Date(a.endTime).getTime();
          for (let j = i + 1; j < arr.length; j++) {
            const b = arr[j];
            const bStart = new Date(b.startTime).getTime();
            if (bStart >= aEnd) break;
            // אם שני המטפלים זהים — זה self-overlap שכבר נתפס למעלה.
            if (a.therapistId === b.therapistId) continue;
            const key = [a.id, b.id].sort().join("|");
            if (seenPair.has(key)) continue;
            seenPair.add(key);
            overlaps.push({
              session1: toEntry(a),
              session2: toEntry(b),
              reason: "clinic_location",
            });
          }
        }
      }
    }

    // ── סינון סופי לפני החזרה ──────────────────────────────────────────
    // (א) עבר תאריך: שתי הפגישות בזוג כבר הסתיימו לפני עכשיו → לא מתריעים
    //     (חפיפה שעדיין מתרחשת כרגע או עתידית — נשמרת).
    // (ב) הוסתר ידנית: זוג שהמשתמש/ת סימן/ה "אל תתריע שוב". ההסתרה פר-userId
    //     (DismissedOverlap) — לא משפיעה על משתמשים אחרים בקליניקה.
    let dismissedSet = new Set<string>();
    try {
      const dismissed = await prisma.dismissedOverlap.findMany({
        where: { userId },
        select: { pairKey: true },
      });
      dismissedSet = new Set(dismissed.map((d) => d.pairKey));
    } catch (e) {
      // רשת ביטחון: אם הטבלה עדיין לא קיימת בייצור (לפני prisma db push), לא
      // מפילים את כל בדיקת החפיפות — סינון "עבר תאריך" ממשיך לעבוד, וההסתרה
      // הידנית תתחיל לפעול אחרי ה-db push.
      logger.warn("DismissedOverlap query failed (table missing?)", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    const nowMs = now.getTime();

    const visibleOverlaps = overlaps.filter((o) => {
      const end1 = new Date(o.session1.endTime).getTime();
      const end2 = new Date(o.session2.endTime).getTime();
      if (Math.max(end1, end2) <= nowMs) return false;
      const pairKey = [o.session1.id, o.session2.id].sort().join("|");
      if (dismissedSet.has(pairKey)) return false;
      return true;
    });

    return NextResponse.json({
      overlaps: visibleOverlaps,
      count: visibleOverlaps.length,
    });
  } catch (error) {
    logger.error("Find overlaps error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בחיפוש חפיפות" },
      { status: 500 }
    );
  }
}
