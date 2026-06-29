// src/lib/audit-failure-alert.ts
//
// חלק א' (סבב אבטחה שלמות-audit, 2026-06-29): התראה אקטיבית על כשל מתמשך
// בכתיבת רשומת audit ל-DB.
//
// הרקע: כתיבת ה-audit (גם DataAccessAuditLog וגם AdminAuditLog ב-best-effort)
// היא fire-and-forget — אם היא נכשלת, ה-user flow ממשיך ונרשם רק logger.warn
// ל-stderr. בסביבת PHI, חור שקט ב-trail הוא בעיה: גישה למידע רפואי יכולה
// להצליח בלי שתיעוד הגישה יישמר, ואף אחד לא יידע. כאן אנחנו מדליקים נורה
// אדומה (AdminAlert) שגלויה בלוח הבקרה, כדי שכשל מתמשך יתגלה ויטופל.
//
// עקרונות:
//   • best-effort — הפונקציה לא זורקת לעולם. אם גם יצירת ה-AdminAlert נכשלת
//     (למשל ה-DB לגמרי למטה), נופלים בשקט ל-logger.warn — אין מה לעשות יותר.
//   • dedup — בודקים אם כבר קיימת התראה PENDING באותו נושא לפני יצירה, כדי לא
//     להציף את הטבלה. בנוסף throttle בזיכרון מונע hammering של ה-DB כשהרבה
//     כתיבות נכשלות ברצף. הדפוס תאם ל-ensureRotationAlert ב-cron-auth.ts.

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

const ALERT_TITLE = "כשל בכתיבת יומן גישה (audit)";

// throttle בזיכרון — לכל היותר בדיקת-DB אחת לחלון, כדי שסדרת כשלים לא תייצר
// עשרות queries. נשמר per-process; אחרי restart מתאפס (וזה בסדר — אם הכשל
// נמשך, ההתראה כבר קיימת PENDING וה-dedup יתפוס).
let lastAlertCheckAt = 0;
const ALERT_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 דקות

/**
 * מדליק AdminAlert על כשל בכתיבת audit. fire-and-forget, לא זורק.
 *
 * @param scope תיאור קצר של המקור (למשל "DataAccessAuditLog" / "delegated-create")
 * @param errorMessage הודעת השגיאה המקורית (לפירוט ב-message)
 */
export function alertAuditWriteFailure(scope: string, errorMessage: string): void {
  // throttle בזיכרון — לא מבזבזים query אם בדקנו לאחרונה.
  const now = Date.now();
  if (now - lastAlertCheckAt < ALERT_CHECK_INTERVAL_MS) return;
  lastAlertCheckAt = now;

  // נטרול fire-and-forget — לא ממתינים, ולא נותנים ל-rejection לטפס.
  void (async () => {
    try {
      const existing = await prisma.adminAlert.findFirst({
        where: { type: "SYSTEM", status: "PENDING", title: ALERT_TITLE },
        select: { id: true },
      });
      if (existing) return; // כבר קיימת התראה פתוחה — dedup.

      await prisma.adminAlert.create({
        data: {
          type: "SYSTEM",
          priority: "HIGH",
          title: ALERT_TITLE,
          message:
            `כתיבת רשומת audit ל-DB נכשלה (מקור: ${scope}). ` +
            `המשמעות: ייתכן שגישה למידע רגיש התרחשה בלי שתיעוד הגישה נשמר ב-DB. ` +
            `הלוג ב-stdout עדיין קיים כ-fallback. שגיאה אחרונה: ${errorMessage.substring(0, 300)}`,
          actionRequired:
            "לבדוק את חיבור ה-DB ואת תקינות טבלאות ה-audit (DataAccessAuditLog / AdminAuditLog). " +
            "לוודא שאין באג סכמה/constraint שמפיל את ה-insert. לאחר התיקון — לסמן את ההתראה כטופלה.",
        },
      });

      logger.error("[audit] write failure alert raised", { scope });
    } catch (err) {
      // גם ההתראה נכשלה — אין מה לעשות מעבר ל-warn. לא לשבור שום flow.
      logger.warn("[audit] failed to raise audit-write-failure alert", {
        scope,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
