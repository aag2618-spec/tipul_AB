// src/app/api/cron/audit-chain-verify/route.ts
// H4 (tamper-evident audit) — אימות מתוזמן של שרשרת ה-hash של טבלאות ה-audit.
//
// רץ ע"י cron (מומלץ: יומי). אם השרשרת נשברה (שינוי/מחיקת שורה) — מרים
// AdminAlert קריטית + לוג שגיאה. אם השרשרת תקינה — מחזיר success שקט.
//
// dedupe: לא יוצרים התראה חדשה בכל ריצה — בודקים אם כבר קיימת PENDING עם
// אותו title. ככה cron יומי לא מציף את ה-AdminAlert.
//
// הערה: ה-endpoint עובד רק אחרי שה-SQL (prisma/sql/audit-chain.sql) רץ בייצור
// דרך start:prod. עד אז verifyAllAuditChains מחזיר initialized=false (אין
// התראה — אין על מה).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";
import { verifyAllAuditChains } from "@/lib/audit-chain";

export const dynamic = "force-dynamic";

const ALERT_TITLE = "[audit] שרשרת יומן הביקורת נשברה — חשד לזיוף/מחיקה";

export async function GET(req: NextRequest) {
  const guard = await checkCronAuth(req);
  if (guard) return guard;

  try {
    const results = await verifyAllAuditChains();
    const broken = results.filter((r) => r.initialized && !r.ok);

    if (broken.length > 0) {
      // פירוט קצר לכל שרשרת שבורה — כמה שבירות וה-seq הראשון.
      const summary = broken
        .map((r) => {
          const first = r.breaks[0];
          const tail = r.tailMatchesHead ? "" : ", מחיקת-זנב אפשרית";
          return `${r.table}: ${r.breaks.length} שבירות${
            first ? ` (החל מ-seq ${first.seq}, ${first.reason})` : ""
          }${tail}`;
        })
        .join(" | ");

      logger.error("[cron audit-chain-verify] CHAIN BROKEN", {
        broken: broken.map((r) => ({
          table: r.table,
          breaks: r.breaks.length,
          firstSeq: r.breaks[0]?.seq ?? null,
          tailMatchesHead: r.tailMatchesHead,
        })),
      });

      // dedupe — אל תיצור התראה כפולה אם כבר יש PENDING פתוחה.
      const existing = await prisma.adminAlert.findFirst({
        where: { type: "SYSTEM", status: "PENDING", title: ALERT_TITLE },
        select: { id: true },
      });
      if (!existing) {
        await prisma.adminAlert.create({
          data: {
            type: "SYSTEM",
            priority: "URGENT",
            status: "PENDING",
            title: ALERT_TITLE,
            message:
              `אימות שרשרת ה-hash של יומן הביקורת נכשל. ייתכן ששורות נמחקו/שונו ` +
              `ישירות במסד הנתונים (לא דרך האפליקציה). פירוט: ${summary}. ` +
              `יש לחקור כחשד לפעילות זדונית/דליפה.`,
            actionRequired:
              "פנה למפתח לחקירה דחופה — ייתכן שמישהו עם גישת DB מחק/שינה רשומות " +
              "ביומן הביקורת. אל תמחק/תשנה דבר עד לסיום החקירה (forensics).",
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      broken: broken.length,
      results: results.map((r) => ({
        table: r.table,
        initialized: r.initialized,
        chainedRows: r.chainedRows,
        tailMatchesHead: r.tailMatchesHead,
        breaks: r.breaks.length,
        ok: r.ok,
      })),
    });
  } catch (error) {
    logger.error("[cron audit-chain-verify] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה באימות שרשרת יומן הביקורת" },
      { status: 500 }
    );
  }
}
