// POST /api/clients/[id]/export-personal-data
//
// R1 (סבב אבטחה 17a, 2026-05-20) — DSAR (Data Subject Access Request).
// חוק הגנת הפרטיות (ישראל) §13 + GDPR Art 15: מטופל זכאי לקבל את כל המידע
// האישי השמור עליו במערכת.
//
// ההבדל מ-/api/clients/[id]/export הקיים:
//   • זה ה-endpoint ה"חוקי" לDSAR — formal, מלא, מובנה.
//   • כולל decryptDeep של כל ה-PHI (ה-export הישן לא קורא ל-decryptDeep!).
//   • כולל CommunicationLog, IntakeResponse, ConsentForm, AIInsight,
//     TherapeuticGoal, EmotionLog, ClientTransferLog, ClientDepartureChoice.
//   • כולל DataAccessAuditLog — "מי ניגש לרשומה שלי" (דרישת DSAR מפורשת).
//   • POST (לא GET) — מונע ייצוא בטעות, מאפשר extension לbody params בעתיד.
//
// סדר ה-checks (לפי feedback_security_fixes.md חוק 3):
//   1. requireAuth — אימות
//   2. loadScopeUser — scope
//   3. isSecretary → 403 (מזכירה לא מורשית לתיק קליני)
//   4. rate-limit (EXPORT_RATE_LIMIT — 3/שעה per-user)
//   5. buildClientWhere + findFirst → 404 אם לא בscope
//   6. buildDsarPayload (פענוח מלא + שליפת audit)
//   7. logDataAccess (audit את הייצוא עצמו)
//   8. serializeDsarToZip → Response עם Content-Disposition
//
// לא נדרש permission חדש — `buildClientWhere` הוא ה-scope check (מטפל יכול
// לייצא רק מטופלים שלו / של הקליניקה שלו).

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { isSecretary } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { logDataAccess } from "@/lib/audit-logger";
import {
  checkRateLimit,
  rateLimitResponse,
  EXPORT_RATE_LIMIT,
} from "@/lib/rate-limit";
import { sanitizeDownloadFilename } from "@/lib/file-validation";
import {
  buildDsarPayload,
  serializeDsarToZip,
  dsarCountsForAudit,
} from "@/lib/dsar";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

    const { id: clientId } = await context.params;

    // 2. Scope
    const scopeUser = await loadScopeUserWithMode(userId);

    // 3. Secretary block — DSAR חושף PHI קליני מלא (סיכומים, תמלולים, ניתוחי AI).
    //    מזכירה חסומה לחלוטין, גם אם יש לה canViewPayments.
    if (isSecretary(scopeUser)) {
      logger.warn("[dsar] Secretary attempted DSAR export", {
        userId,
        clientId,
      });
      return NextResponse.json(
        { message: "אין הרשאה לייצוא תיק קליני" },
        { status: 403 }
      );
    }

    // 4. Rate-limit — 3/שעה per-user. DSAR יקר (כל ה-tables של מטופל) ולכן
    //    וקטור scraping/exfiltration אם תוקף מצליח להשיג credentials.
    //    מפתח ייחודי `dsar-export:${userId}` — נפרד מ-`client-export:` של
    //    ה-export הישן כך שמטפל יכול לעשות גם וגם בלי להחסם הדדית.
    const rateCheck = checkRateLimit(
      `dsar-export:${userId}`,
      EXPORT_RATE_LIMIT
    );
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    // 5-6. שליפה + פענוח מלא דרך helper.
    const payload = await buildDsarPayload(clientId, scopeUser);
    if (!payload) {
      return NextResponse.json(
        { message: "מטופל לא נמצא" },
        { status: 404 }
      );
    }

    // 7. Audit — חובה לפי תקנות הגנת הפרטיות 2017.
    //    `meta.exportType = "DSAR"` מבדיל בין שתי ה-routes ב-audit search.
    //    Impersonation: `userId` הוא ה-target (`requireAuth` חוזר על ה-target
    //    במצב impersonation לצורך scope/data). ה-OWNER האמיתי נשמר ב-
    //    `meta.impersonatedBy` דרך הפרמטר הדדיקטיבי `impersonatedBy` של
    //    logDataAccess (Phase 2) — תאם ל-audit trail בכל ה-routes הקליניים.
    logDataAccess({
      userId,
      recordType: "CLIENT_PROFILE",
      recordId: clientId,
      action: "EXPORT",
      clientId,
      request,
      meta: {
        exportType: "DSAR",
        ...dsarCountsForAudit(payload),
      },
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    // 8. ZIP + response.
    const zipBuffer = await serializeDsarToZip(payload);

    // שם הקובץ עם שם המטופל. sanitizeDownloadFilename מסיר תווי bidi-override
    // (anti-spoofing) ומחזיר ASCII + UTF-8 encoded לContent-Disposition מלא.
    const clientName = (payload.client.name as string | null) ?? "client";
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const rawFilename = `DSAR-${clientName}-${dateStr}.zip`;
    const { asciiSafe, utf8Encoded } = sanitizeDownloadFilename(rawFilename);

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiSafe}"; filename*=UTF-8''${utf8Encoded}`,
        // M16.5 (סבב 16b): אסור cache של PHI exports — חובה no-store.
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
      },
    });
  } catch (err) {
    // loadScopeUser זורק על user not found / blocked. שאר השגיאות = DB/serialize.
    logger.error("[dsar] export failed", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הקובץ" },
      { status: 500 }
    );
  }
}
