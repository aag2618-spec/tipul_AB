// src/app/api/integrations/cardcom/diagnose/route.ts
//
// כלי אבחון פנימי: למה הופיעה ההודעה "לא הוגדר מסוף Cardcom" כשהמשתמש
// מנסה לחייב? מחקה בדיוק את אותה שרשרת לוגית של
// /api/payments/[id]/charge-cardcom + resolveCardcomBilling +
// getUserCardcomCredentials, ומחזיר דיווח בעברית עם:
//   • איזה userId זוהה בסשן
//   • אילו רשומות BillingProvider של Cardcom קיימות אצלו (פעילות/לא פעילות)
//   • אם paymentId נשלח: מי ה-therapistId של המטופל, מה ה-organizationId,
//     ומה ה-resolver החזיר ולמה
//   • האם פענוח ה-credentials הצליח (TerminalNumber + ApiName)
//
// לא חושף סיסמאות, לא חושף מפתחות הצפנה, לא נוגע בנתונים — קריאה בלבד.
// מוגן ב-requireAuth (כמו שאר ה-API).
//
// שימוש:
//   GET /api/integrations/cardcom/diagnose                 — בדיקת הסטטוס שלי
//   GET /api/integrations/cardcom/diagnose?paymentId=xxx   — בדיקה לתשלום ספציפי

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  getUserCardcomCredentials,
} from "@/lib/cardcom/user-config";
import { resolveCardcomBilling } from "@/lib/cardcom/billing-resolver";

export const dynamic = "force-dynamic";

interface ProviderRowReport {
  id: string;
  isActive: boolean;
  isPrimary: boolean;
  displayName: string | null;
  mode: string;
  createdAt: string;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasWebhookSecret: boolean;
}

interface DiagnoseReport {
  hebrewSummary: string;
  status: "ok" | "warning" | "error";
  session: {
    userId: string;
    originalUserId: string;
    isImpersonating: boolean;
    isOwnerOfOrg: boolean;
    organizationId: string | null;
    organizationOwnerUserId: string | null;
  };
  myCardcomProviders: ProviderRowReport[];
  credentialsCheck: {
    attempted: boolean;
    success: boolean;
    terminalNumberMasked: string | null;
    apiNamePresent: boolean;
    apiPasswordPresent: boolean;
    mode: string | null;
    errorMessage: string | null;
  };
  paymentContext?: {
    paymentId: string;
    found: boolean;
    intendedTherapistId: string | null;
    intendedTherapistEmail: string | null;
    intendedTherapistHasOwnCardcom: boolean | null;
    paymentOrganizationId: string | null;
    resolverResult:
      | {
          ok: true;
          cardcomOwnerUserId: string;
          fellbackToOrgOwner: boolean;
          ownerCredentialsLoadable: boolean;
        }
      | { ok: false; reason: string }
      | null;
  };
}

function maskTerminal(n: string): string {
  if (!n) return "(ריק)";
  if (n.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, n.length - 4))}${n.slice(-4)}`;
}

async function reportProvidersFor(userId: string): Promise<ProviderRowReport[]> {
  try {
    const rows = await prisma.billingProvider.findMany({
      where: { userId, provider: "CARDCOM" },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => {
      const settings = (r.settings as { mode?: string } | null) ?? null;
      return {
        id: r.id,
        isActive: r.isActive,
        isPrimary: r.isPrimary,
        displayName: r.displayName ?? null,
        mode: settings?.mode ?? "(לא צוין)",
        createdAt: r.createdAt.toISOString(),
        hasApiKey: !!r.apiKey,
        hasApiSecret: !!r.apiSecret,
        hasWebhookSecret: !!r.webhookSecret,
      };
    });
  } catch (err) {
    logger.error("[diagnose] reportProvidersFor failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, originalUserId, session } = auth;

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");

  // ── סקירת סשן + תפקיד בארגון ────────────────────────────────────
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      organizationId: true,
      ownedOrganization: { select: { id: true, ownerUserId: true } },
    },
  });
  const orgId = me?.organizationId ?? me?.ownedOrganization?.id ?? null;
  let orgOwnerUserId: string | null = null;
  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { ownerUserId: true },
    });
    orgOwnerUserId = org?.ownerUserId ?? null;
  }
  const isOwnerOfOrg = !!orgOwnerUserId && orgOwnerUserId === userId;

  // ── הרשומות של ה-BillingProvider שלי ─────────────────────────────
  const myProviders = await reportProvidersFor(userId);

  // ── ניסיון אמיתי לטעון credentials (פענוח כולל) ──────────────────
  const credentialsCheck: DiagnoseReport["credentialsCheck"] = {
    attempted: true,
    success: false,
    terminalNumberMasked: null,
    apiNamePresent: false,
    apiPasswordPresent: false,
    mode: null,
    errorMessage: null,
  };
  try {
    const creds = await getUserCardcomCredentials(userId);
    if (creds) {
      credentialsCheck.success = true;
      credentialsCheck.terminalNumberMasked = maskTerminal(
        creds.config.terminalNumber || ""
      );
      credentialsCheck.apiNamePresent = !!creds.config.apiName;
      credentialsCheck.apiPasswordPresent = !!creds.config.apiPassword;
      credentialsCheck.mode = creds.config.mode;
    } else {
      credentialsCheck.errorMessage = "getUserCardcomCredentials החזיר null";
    }
  } catch (err) {
    credentialsCheck.errorMessage =
      err instanceof Error ? err.message : String(err);
  }

  // ── הקשר תשלום ספציפי (אופציונלי) ───────────────────────────────
  let paymentContext: DiagnoseReport["paymentContext"] | undefined;
  if (paymentId) {
    paymentContext = {
      paymentId,
      found: false,
      intendedTherapistId: null,
      intendedTherapistEmail: null,
      intendedTherapistHasOwnCardcom: null,
      paymentOrganizationId: null,
      resolverResult: null,
    };
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        organizationId: true,
        client: {
          select: {
            therapistId: true,
            therapist: { select: { id: true, email: true } },
          },
        },
      },
    });
    if (payment) {
      paymentContext.found = true;
      paymentContext.intendedTherapistId = payment.client.therapistId;
      paymentContext.intendedTherapistEmail =
        payment.client.therapist?.email ?? null;
      paymentContext.paymentOrganizationId = payment.organizationId;

      const therapistProviders = await prisma.billingProvider.findMany({
        where: {
          userId: payment.client.therapistId,
          provider: "CARDCOM",
          isActive: true,
        },
        select: { id: true },
      });
      paymentContext.intendedTherapistHasOwnCardcom =
        therapistProviders.length > 0;

      const resolved = await resolveCardcomBilling(
        payment.client.therapistId,
        payment.organizationId
      );
      if (resolved) {
        let ownerCredsLoadable = false;
        try {
          const c = await getUserCardcomCredentials(resolved.cardcomOwnerUserId);
          ownerCredsLoadable = !!c;
        } catch {
          ownerCredsLoadable = false;
        }
        paymentContext.resolverResult = {
          ok: true,
          cardcomOwnerUserId: resolved.cardcomOwnerUserId,
          fellbackToOrgOwner: resolved.fellbackToOrgOwner,
          ownerCredentialsLoadable: ownerCredsLoadable,
        };
      } else {
        // re-derive a human reason
        let reason = "no_cardcom_anywhere";
        if (!payment.organizationId) reason = "no_organization_id";
        paymentContext.resolverResult = { ok: false, reason };
      }
    }
  }

  // ── סיכום בעברית ידידותי ────────────────────────────────────────
  const lines: string[] = [];
  let status: "ok" | "warning" | "error" = "ok";

  lines.push(`👤 משתמש: ${me?.email ?? userId}`);
  if (session.user.actingAs) {
    lines.push(`⚠️ התחזות פעילה — userId שמוצג כאן הוא של ה-target.`);
    status = "warning";
  }
  if (orgId) {
    lines.push(
      `🏢 ארגון: ${orgId} ${isOwnerOfOrg ? "(אני בעל/ת הארגון)" : `(הבעלים: ${orgOwnerUserId ?? "לא ידוע"})`}`
    );
  } else {
    lines.push("🏢 לא משויך/ת לארגון (מטפל/ת עצמאי/ת).");
  }

  if (myProviders.length === 0) {
    lines.push(
      "❌ אין לך אף רשומת Cardcom ב-BillingProvider. הסיבה: לא חיברת/החיבור נמחק. פתרון: כנסי להגדרות → אינטגרציות חיוב → Cardcom."
    );
    status = "error";
  } else {
    const active = myProviders.filter((p) => p.isActive);
    const inactive = myProviders.filter((p) => !p.isActive);
    if (active.length > 0) {
      lines.push(
        `✅ נמצאו ${active.length} רשומות Cardcom פעילות (mode: ${active.map((p) => p.mode).join(", ")}).`
      );
    }
    if (inactive.length > 0) {
      lines.push(
        `⚠️ נמצאו ${inactive.length} רשומות Cardcom **לא פעילות** (isActive=false). זו הסיבה הנפוצה ל"לא הוגדר מסוף". פתרון: בהגדרות → Cardcom → להפעיל מחדש (חיבור מחדש).`
      );
      if (active.length === 0) status = "error";
      else if (status === "ok") status = "warning";
    }
  }

  if (credentialsCheck.attempted) {
    if (credentialsCheck.success) {
      lines.push(
        `🔓 פענוח credentials הצליח. מסוף: ${credentialsCheck.terminalNumberMasked}, ApiName: ${credentialsCheck.apiNamePresent ? "✓" : "✗"}, ApiPassword: ${credentialsCheck.apiPasswordPresent ? "✓" : "✗"}, mode: ${credentialsCheck.mode}.`
      );
      if (!credentialsCheck.apiNamePresent) {
        lines.push(
          "⚠️ חסר ApiName — בקשות Cardcom ייכשלו. פתרון: עדכון ב-Cardcom Setup."
        );
        status = "error";
      }
    } else {
      lines.push(
        `❌ פענוח credentials נכשל: ${credentialsCheck.errorMessage ?? "(שגיאה לא ידועה)"}. הסיבה הנפוצה: שונה ENCRYPTION_KEY ב-env אחרי שמירת המסוף, או הרשומה נשמרה ב-env אחר. פתרון: חיבור מחדש של Cardcom בהגדרות.`
      );
      status = "error";
    }
  }

  if (paymentContext) {
    if (!paymentContext.found) {
      lines.push(`❌ paymentId ${paymentContext.paymentId} לא נמצא ב-DB.`);
      status = "error";
    } else {
      lines.push(
        `💳 תשלום: ${paymentContext.paymentId} | מטפל/ת בעלת המטופל: ${paymentContext.intendedTherapistEmail ?? paymentContext.intendedTherapistId} | organizationId: ${paymentContext.paymentOrganizationId ?? "(אין)"}`
      );
      lines.push(
        `   • למטפל/ת הזו יש Cardcom פעיל משלה? ${paymentContext.intendedTherapistHasOwnCardcom ? "כן" : "לא"}`
      );
      const r = paymentContext.resolverResult;
      if (r?.ok) {
        lines.push(
          `   • Resolver החזיר Cardcom של userId=${r.cardcomOwnerUserId}${r.fellbackToOrgOwner ? " (פלבק לבעל הקליניקה)" : ""}. credentials של ה-owner נטענות בהצלחה? ${r.ownerCredentialsLoadable ? "כן ✅" : "לא ❌"}.`
        );
        if (!r.ownerCredentialsLoadable) {
          lines.push(
            "   ⚠️ המשמעות: הרשומה קיימת ב-DB אבל פענוח נכשל — בעיית ENCRYPTION_KEY או credentials פגומים. פתרון: חיבור מחדש."
          );
          status = "error";
        }
      } else if (r) {
        lines.push(
          `   ❌ Resolver החזיר null. סיבה: ${r.reason}. כלומר: לא נמצא Cardcom פעיל לא אצל המטפל/ת המיועד/ת ולא אצל בעל הקליניקה.`
        );
        status = "error";
      }
    }
  }

  const report: DiagnoseReport = {
    hebrewSummary: lines.join("\n"),
    status,
    session: {
      userId,
      originalUserId,
      isImpersonating: !!session.user.actingAs,
      isOwnerOfOrg,
      organizationId: orgId,
      organizationOwnerUserId: orgOwnerUserId,
    },
    myCardcomProviders: myProviders,
    credentialsCheck,
    paymentContext,
  };

  return NextResponse.json(report);
}
