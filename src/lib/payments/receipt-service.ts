import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";
import { createBillingService } from "@/lib/billing";
import { getReceiptPageUrl } from "@/lib/receipt-token";
import { mapPaymentMethod } from "@/lib/email-utils";
import { calculateDebtFromPayments } from "@/lib/payment-utils";
import { logger } from "@/lib/logger";
import { getIsraelYear } from "@/lib/date-utils";
import { resolveCardcomBilling } from "@/lib/cardcom/billing-resolver";
import type { PaymentMethod, ReceiptResult } from "./types";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "./types";

// ================================================================
// isCardcomPrimary — מדיניות מרכזית: האם Cardcom הוא ספק הקבלות הראשי
// ================================================================
//
// Cardcom הוא חברת הפקת חשבוניות מוסמכת — מספרי הקבלה שלהם רשומים במערך
// חשבוניות ישראל ולכן הם המסמך המשפטי. כשהוא מחובר:
//   1. הקבלה מופקת תמיד דרכו (ללא תלות ב-checkbox "הוצא קבלה" — זה החוק).
//   2. המייל שולח ע"י Cardcom (לא ע"י MyTipul) — אסור לשלוח מייל פנימי
//      כי זה יוצר רושם של 2 קבלות שונות.
//
// In-process cache קצר (5 שניות) — בקשת תשלום אחת קוראת ל-helper הזה
// 2-3 פעמים (issueReceipt + payment-creator + sendPaymentReceiptEmail).
// בלי cache זה 3 SELECTs רצופים על אותו הוא BillingProvider. cache קצר
// כי שינויי מדיניות (כיבוי/הפעלת ספק) לא צריכים לחכות לדקה.
const CARDCOM_PRIMARY_CACHE_TTL_MS = 5_000;
const cardcomPrimaryCache = new Map<string, { value: boolean; expiresAt: number }>();

export async function isCardcomPrimary(userId: string): Promise<boolean> {
  const cached = cardcomPrimaryCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const primary = await prisma.billingProvider.findFirst({
      where: { userId, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { provider: true },
    });
    const value = primary?.provider === "CARDCOM";
    cardcomPrimaryCache.set(userId, {
      value,
      expiresAt: Date.now() + CARDCOM_PRIMARY_CACHE_TTL_MS,
    });
    return value;
  } catch (err) {
    logger.warn("[isCardcomPrimary] DB lookup failed — assuming false", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ================================================================
// resolveCardcomReceiptOwner — היכן באמת נמצא ה-Cardcom שייצור את הקבלה
// ================================================================
//
// זהה ל-resolveCardcomBilling אבל מיושם כשליפה ל-receipt routing:
//   • אם למטפל (intendedUserId) יש Cardcom פעיל → קבלה דרכו.
//   • אחרת אם הלקוח שייך לקליניקה ולבעל הקליניקה יש Cardcom → fallback.
//   • אחרת null (אין Cardcom בכלל בסקופ הזה).
//
// שימוש: issueReceipt קורא ל-helper הזה כדי לדעת:
//   (א) האם להפעיל את מסלול Cardcom (החלפה ל-isCardcomPrimary שמסתכל רק על
//       ה-userId הישיר ומחמיץ את ה-fallback של בעל הקליניקה).
//   (ב) באיזה userId להשתמש כשקוראים ל-billingService.createReceipt — בלי
//       זה הקבלה הייתה נכשלת על "לא נמצא ספק" כי billingService מחפש לפי
//       userId שאין לו BillingProvider.
//
// In-process cache קצר (5s) זהה ל-isCardcomPrimary — אותה בקשת תשלום קוראת
// כמה פעמים. הקאש ממופתח לפי `${intendedUserId}|${organizationId ?? ""}`
// כדי שלא נדרוס תוצאות בין clients מקליניקות שונות.
const CARDCOM_RECEIPT_OWNER_CACHE_TTL_MS = 5_000;
const cardcomReceiptOwnerCache = new Map<
  string,
  { value: { ownerUserId: string; fellbackToOrgOwner: boolean } | null; expiresAt: number }
>();

export async function resolveCardcomReceiptOwner(
  intendedUserId: string,
  organizationId?: string | null,
): Promise<{ ownerUserId: string; fellbackToOrgOwner: boolean } | null> {
  const key = `${intendedUserId}|${organizationId ?? ""}`;
  const cached = cardcomReceiptOwnerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const resolved = await resolveCardcomBilling(intendedUserId, organizationId);
  const value = resolved
    ? {
        ownerUserId: resolved.cardcomOwnerUserId,
        fellbackToOrgOwner: resolved.fellbackToOrgOwner,
      }
    : null;
  cardcomReceiptOwnerCache.set(key, {
    value,
    expiresAt: Date.now() + CARDCOM_RECEIPT_OWNER_CACHE_TTL_MS,
  });
  return value;
}

// ================================================================
// issueReceipt
// ================================================================

export async function issueReceipt(params: {
  userId: string;
  paymentId: string;
  amount: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  description: string;
  method: PaymentMethod;
}): Promise<ReceiptResult> {
  // CRITICAL idempotency — issueReceipt is called from createPaymentForSession,
  // addPartialPayment, AND markFullyPaid; a UI double-click or retry could
  // trigger it twice for the same Payment. With internal numbering the cost
  // was a wasted sequence number; with Cardcom Documents/Create it's a REAL
  // document registered with מערך חשבוניות ישראל that's hard to undo.
  //
  // We use an atomic claim via `updateMany` with `hasReceipt: false` in the
  // WHERE clause — only ONE caller can flip it. The placeholder receiptNumber
  // marks "in flight"; the success path overwrites it with the real number,
  // the failure path releases it (sets hasReceipt back to false).
  //
  // SELF-HEAL — if a previous call crashed mid-flow (e.g. node OOM, container
  // restart) the row is stuck with `hasReceipt:true, receiptNumber:PENDING-*`.
  // Without recovery, the therapist could never re-issue. Reclaim any stale
  // PENDING marker older than 60 seconds: real Cardcom calls take ~1-3s, so
  // 60s is a generous buffer that won't accidentally release an in-flight
  // legitimate call.
  const STALE_CLAIM_MS = 60_000;
  const staleCutoff = Date.now() - STALE_CLAIM_MS;
  try {
    const stale = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: { hasReceipt: true, receiptNumber: true },
    });
    if (
      stale?.hasReceipt &&
      stale.receiptNumber?.startsWith("PENDING-")
    ) {
      const tsMatch = stale.receiptNumber.match(/^PENDING-(\d+)-/);
      const staleTs = tsMatch ? Number(tsMatch[1]) : 0;
      if (staleTs > 0 && staleTs < staleCutoff) {
        logger.warn("[issueReceipt] releasing stale PENDING claim", {
          paymentId: params.paymentId,
          claimAgeMs: Date.now() - staleTs,
          marker: stale.receiptNumber,
        });
        await prisma.payment.updateMany({
          where: { id: params.paymentId, receiptNumber: stale.receiptNumber },
          data: { hasReceipt: false, receiptNumber: null, receiptUrl: null },
        });
      }
    }
  } catch (err) {
    // Best-effort self-heal; if it fails we still attempt the claim and the
    // user gets a "כבר בהפקה" soft error if the stale claim is still there.
    logger.warn("[issueReceipt] stale-claim check failed", {
      paymentId: params.paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // H7: שימוש ב-crypto.randomBytes במקום Math.random — PRNG לא קריפטוגרפי
  // מנחש marker פעיל יכול לגרום ל-race ב-issueReceipt וקבלה כפולה (מסמך
  // משפטי כפול במערך חשבוניות ישראל).
  const { randomBytes } = await import("node:crypto");
  const claimMarker = `PENDING-${Date.now()}-${randomBytes(6).toString("hex")}`;
  const claim = await prisma.payment.updateMany({
    where: { id: params.paymentId, hasReceipt: false },
    data: { hasReceipt: true, receiptNumber: claimMarker },
  });
  if (claim.count === 0) {
    // Lost the race OR receipt already issued. Return whatever's there now.
    const current = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: { hasReceipt: true, receiptNumber: true, receiptUrl: true },
    });
    if (current?.receiptNumber?.startsWith("PENDING-")) {
      // Another caller is mid-flight. Don't trust this state — the other
      // caller will finalize it. Return a soft error so the caller can retry
      // in a moment.
      return {
        receiptNumber: null,
        receiptUrl: null,
        hasReceipt: false,
        error: "הקבלה כבר בהפקה — נסי שוב בעוד רגע",
      };
    }
    return {
      receiptNumber: current?.receiptNumber ?? null,
      receiptUrl: current?.receiptUrl ?? null,
      hasReceipt: !!current?.hasReceipt,
    };
  }
  // We hold the claim. Any code path returning from now on must either
  // RELEASE the claim (set hasReceipt=false) on failure, OR REPLACE the
  // placeholder receiptNumber with the real one on success. The helper below
  // releases the claim and re-throws/re-returns.
  const releaseClaim = async () => {
    try {
      await prisma.payment.updateMany({
        where: { id: params.paymentId, receiptNumber: claimMarker },
        data: { hasReceipt: false, receiptNumber: null, receiptUrl: null },
      });
    } catch (releaseErr) {
      logger.error("[issueReceipt] failed to release claim — manual cleanup may be needed", {
        paymentId: params.paymentId,
        claimMarker,
        error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
      });
    }
  };

  // SAFETY NET — `claimResolved` flips to true once the claim is either
  // released OR overwritten with the real receipt info. The `try/finally` at
  // the end of the function calls `releaseClaim()` if NEITHER happened by then
  // (i.e. an uncaught throw mid-flow). Without this, any unexpected failure
  // would leak the placeholder forever and the self-heal at the top would
  // only kick in 60s later. Mark this AFTER the `payment.update` (success
  // paths) or AFTER the explicit `releaseClaim()` call (failure paths).
  let claimResolved = false;
  try {

  const therapist = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { businessType: true },
  });

  if (!therapist) {
    await releaseClaim();
    claimResolved = true;
    return { receiptNumber: null, receiptUrl: null, hasReceipt: false };
  }

  // Prefer the therapist's Cardcom-issued receipt for ANY business type
  // (EXEMPT or LICENSED) when Cardcom is the primary BillingProvider. Cardcom
  // is a חברת הפקת חשבוניות מוסמכת — their numbering is registered with מערך
  // חשבוניות ישראל, so the receipt is the legal document.
  //
  // CLINIC FALLBACK — אם המטפל הספציפי לא חיבר Cardcom אבל יש לו ארגון,
  // resolveCardcomReceiptOwner מחזיר את ה-userId של בעל הקליניקה (שכן חיבר
  // Cardcom). זה גם הכרחי לתשלומי מזומן: בלי זה issueReceipt היה משתמש
  // ב-isCardcomPrimary(therapistId) → false → לא מנפיק קבלת Cardcom גם
  // כשהקליניקה כן מחוברת.
  //
  // אנחנו טוענים את organizationId של ה-Payment כדי לאפשר את ה-fallback.
  const paymentOrg = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    select: { organizationId: true },
  });
  const cardcomOwner = await resolveCardcomReceiptOwner(
    params.userId,
    paymentOrg?.organizationId ?? null,
  );
  const cardcomIsPrimary = !!cardcomOwner;

  // ⚠️ businessType גייט — חשוב שהבדיקה תבוצע על ה-EFFECTIVE ISSUER:
  //   • אם Cardcom פעיל (כולל פלבק לבעל הקליניקה) — היוצר החוקי הוא בעל
  //     המסוף (cardcomOwner.ownerUserId). הוא חייב להיות EXEMPT/LICENSED;
  //     ה-businessType של המטפל לא רלוונטי כי הקבלה לא יוצאת בשמו.
  //   • אם אין Cardcom — חוזרים למסלול הפנימי (numbering לפי המטפל); אז
  //     ה-businessType של המטפל הוא שקובע (NONE = לא יוצא קבלה).
  // בלי זה: מטפל בקליניקה עם businessType=NONE היה חוסם הפקת קבלת Cardcom
  // למרות שהמסוף של ה-OWNER (LICENSED/EXEMPT) זמין ולגיטימי משפטית.
  let issuerBusinessType: "NONE" | "EXEMPT" | "LICENSED" = therapist.businessType;
  if (cardcomIsPrimary && cardcomOwner) {
    if (cardcomOwner.ownerUserId !== params.userId) {
      const issuer = await prisma.user.findUnique({
        where: { id: cardcomOwner.ownerUserId },
        select: { businessType: true },
      });
      issuerBusinessType = issuer?.businessType ?? "NONE";
    }
  }
  if (issuerBusinessType === "NONE") {
    await releaseClaim();
    claimResolved = true;
    return { receiptNumber: null, receiptUrl: null, hasReceipt: false };
  }

  // ──────────────────────────────────────────────────────────────────
  // עוסק פטור (EXEMPT) עם מסוף Cardcom *משלו* → קבלה פנימית, לא Cardcom.
  // ──────────────────────────────────────────────────────────────────
  // עוסק פטור הוא המנפיק החוקי של הקבלות שלו, ומספור רץ פנימי תקף ואינו דורש
  // ספק מוסמך. לכן הגדרת המטפל גוברת על נוכחות Cardcom — Cardcom נשאר מחובר
  // לסליקת אשראי בלבד (מסמך האשראי נוצר במסלול charge-cardcom, לא כאן). זו גם
  // ההתנהגות שהייתה עם iCount; הכפייה ל-Cardcom (commit 79c139de/372e550a)
  // הוחלה רק על Cardcom. מגבילים ל-מסוף *של המטפל עצמו* (ownerUserId===userId)
  // כדי לא לשבור קליניקות שבהן עוסק פטור ללא מסוף גובה דרך מסוף בעל הקליניקה —
  // שם ה-fallback של resolveCardcomReceiptOwner נשמר כמו שהיה.
  const exemptSelfIssuer =
    therapist.businessType === "EXEMPT" &&
    cardcomOwner?.ownerUserId === params.userId;

  if (cardcomIsPrimary && cardcomOwner && !exemptSelfIssuer) {
    if (cardcomOwner.fellbackToOrgOwner) {
      logger.info("[issueReceipt] using clinic-owner Cardcom for receipt", {
        paymentId: params.paymentId,
        intendedTherapistId: params.userId,
        cardcomOwnerUserId: cardcomOwner.ownerUserId,
        method: params.method,
      });
    }
    const billingService = createBillingService(cardcomOwner.ownerUserId);
    let result;
    try {
      result = await billingService.createReceipt({
        clientName: params.clientName,
        clientEmail: params.clientEmail,
        clientPhone: params.clientPhone,
        amount: params.amount,
        description: params.description,
        paymentMethod: mapPaymentMethod(params.method),
        paymentId: params.paymentId,
        // CHANGED — לפי המדיניות החדשה: כש-Cardcom הוא הספק הראשי, Cardcom
        // הוא המנפיק החוקי וצריך לשלוח את הקבלה ללקוח ישירות (בלי שאנחנו
        // נשלח מייל פנימי כפול). אם אין מייל ללקוח Cardcom פשוט יחזיר
        // בלי לשלוח — זה לא מפיל את ההפקה.
        sendEmail: !!params.clientEmail,
      });
    } catch (err) {
      logger.error("[issueReceipt] Cardcom call threw", {
        userId: params.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      // NO silent fallback — see policy comment above. Release the claim so
      // the therapist can retry, and return error so caller surfaces it.
      await releaseClaim();
    claimResolved = true;
      // Translate common English errors from CardcomClient into Hebrew so
      // the therapist sees something useful in the toast.
      const raw = err instanceof Error ? err.message : String(err);
      const hebrewMessage = (() => {
        if (raw.includes("CARDCOM_REFUSE_SANDBOX_IN_PRODUCTION")) {
          return "מסוף sandbox לא מורשה בפרודקשן — שני את ה-mode בהגדרות";
        }
        if (raw.includes("CARDCOM_TIMEOUT")) {
          return "Cardcom לא הגיב בזמן — נסי שוב בעוד רגע";
        }
        if (raw.startsWith("CARDCOM_HTTP_")) {
          return `Cardcom החזיר שגיאה (${raw.replace("CARDCOM_HTTP_", "HTTP ")})`;
        }
        if (raw.includes("CARDCOM_MISSING_")) {
          return "חסרים פרטי מסוף ב-Cardcom — בדקי בהגדרות";
        }
        return `שגיאת תקשורת עם Cardcom — ${raw}`;
      })();
      return {
        receiptNumber: null,
        receiptUrl: null,
        hasReceipt: false,
        error: hebrewMessage,
      };
    }
    if (result.success) {
      const receiptUrl = result.receiptUrl || null;
      const receiptNumber = result.receiptNumber || null;
      // REPLACE the placeholder with the real receipt info.
      await prisma.payment.update({
        where: { id: params.paymentId },
        data: { receiptUrl, receiptNumber, hasReceipt: true },
      });
      claimResolved = true;
      return { receiptNumber, receiptUrl, hasReceipt: true };
    }
    // Cardcom returned `notSupported` — the standalone Documents/Create
    // endpoint isn't enabled on this terminal. Fall back to internal numbering
    // for EXEMPT (legitimate — the therapist IS the legal issuer). For
    // LICENSED, fail loudly because internal numbering would NOT be a valid
    // tax invoice.
    if (result.notSupported) {
      logger.warn("[issueReceipt] Cardcom Documents/Create not supported on terminal — falling back", {
        userId: params.userId,
        businessType: therapist.businessType,
      });
      await releaseClaim();
      // Don't mark claimResolved=true yet — if any of the fallback DB writes
      // throw, the finally-block's releaseClaim is a safe no-op (claimMarker
      // already cleared) and the row stays in a clean PENDING-eligible state.
      if (therapist.businessType === "EXEMPT") {
        // EXEMPT therapist's internal numbering is the legitimate fallback —
        // they ARE the legal issuer, so internal sequential numbers are valid.
        const receiptUser = await prisma.user.update({
          where: { id: params.userId },
          data: { nextReceiptNumber: { increment: 1 } },
          select: { nextReceiptNumber: true },
        });
        const reservedNumber = (receiptUser.nextReceiptNumber ?? 2) - 1;
        const year = getIsraelYear();
        const internalReceiptNumber = `${year}-${String(reservedNumber).padStart(4, "0")}`;
        const internalReceiptUrl = getReceiptPageUrl(params.paymentId);
        await prisma.payment.update({
          where: { id: params.paymentId },
          data: {
            receiptNumber: internalReceiptNumber,
            receiptUrl: internalReceiptUrl,
            hasReceipt: true,
          },
        });
        // Mark resolved AFTER the writes succeed — if user.update or
        // payment.update throws, the function propagates the error and the
        // finally calls releaseClaim() (no-op safe).
        claimResolved = true;
        return {
          receiptNumber: internalReceiptNumber,
          receiptUrl: internalReceiptUrl,
          hasReceipt: true,
        };
      }
      claimResolved = true;
      return {
        receiptNumber: null,
        receiptUrl: null,
        hasReceipt: false,
        error:
          "Cardcom לא תומך בהפקת קבלת מזומן ישירה במסוף זה. עוסק מורשה דורש קבלה מספק מוסמך — חברי iCount או Green Invoice בנוסף.",
      };
    }
    logger.error("[issueReceipt] Cardcom receipt creation failed", {
      userId: params.userId,
      error: String(result.error),
    });
    await releaseClaim();
    claimResolved = true;
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: result.error || "Cardcom לא הצליח להפיק קבלה — בדקי הגדרות מסוף",
    };
  }

  if (therapist.businessType === "EXEMPT") {
    const receiptUser = await prisma.user.update({
      where: { id: params.userId },
      data: { nextReceiptNumber: { increment: 1 } },
      select: { nextReceiptNumber: true },
    });
    const reservedNumber = (receiptUser.nextReceiptNumber ?? 2) - 1;
    // שנת קבלה — לפי שעון ישראל (קבלה ב-1.1 00:30 ישראל חייבת לקבל את השנה החדשה)
    const year = getIsraelYear();
    const receiptNumber = `${year}-${String(reservedNumber).padStart(4, "0")}`;
    const receiptUrl = getReceiptPageUrl(params.paymentId);

    // REPLACE the placeholder with the real receipt info.
    await prisma.payment.update({
      where: { id: params.paymentId },
      data: { receiptNumber, receiptUrl, hasReceipt: true },
    });
    claimResolved = true;

    return { receiptNumber, receiptUrl, hasReceipt: true };
  }

  // עוסק מורשה — billing provider
  try {
    const billingService = createBillingService(params.userId);
    const result = await billingService.createReceipt({
      clientName: params.clientName,
      clientEmail: params.clientEmail,
      clientPhone: params.clientPhone,
      amount: params.amount,
      description: params.description,
      paymentMethod: mapPaymentMethod(params.method),
      sendEmail: false,
    });

    if (result.success) {
      const receiptUrl = result.receiptUrl || null;
      const receiptNumber = result.receiptNumber || null;

      // REPLACE the placeholder with the real receipt info.
      await prisma.payment.update({
        where: { id: params.paymentId },
        data: { receiptUrl, receiptNumber, hasReceipt: true },
      });
      claimResolved = true;
      return { receiptNumber, receiptUrl, hasReceipt: true };
    }

    logger.error("Billing receipt creation failed", { error: String(result.error) });
    await releaseClaim();
    claimResolved = true;
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: result.error || "שגיאה ביצירת קבלה בספק החיוב",
    };
  } catch (err) {
    logger.error("Error creating receipt via billing provider", { error: err instanceof Error ? err.message : String(err) });
    await releaseClaim();
    claimResolved = true;
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: err instanceof Error ? err.message : "שגיאה ביצירת קבלה",
    };
  }
  } finally {
    // SAFETY NET — if any path above threw OR forgot to mark claimResolved
    // (developer bug), release the placeholder so the row isn't stuck. The
    // 60s self-heal at the top is a backup; this finally is the primary
    // protection against orphan PENDING markers.
    if (!claimResolved) {
      logger.warn("[issueReceipt] uncaught path — releasing claim defensively", {
        paymentId: params.paymentId,
      });
      await releaseClaim();
    }
  }
}

// ================================================================
// sendPaymentReceiptEmail
// ================================================================

export async function sendPaymentReceiptEmail(params: {
  userId: string;
  clientId: string;
  amountPaid: number;
  expectedAmount: number;
  method: string;
  paidAt: Date;
  session?: { startTime: Date; type: string } | null;
  receiptUrl?: string | null;
  receiptNumber?: string | null;
  sessionRemainingAfterPayment?: number;
  // אופציונלי — paymentId של ה-Payment הספציפי. כש-מועבר, ה-skip של
  // מייל פנימי מתבצע באופן context-aware: רק אם ל-Payment הזה כבר נוצר
  // CardcomInvoice (Cardcom שלח/ישלח קבלה משלו), או שזה זרם CC LowProfile
  // עם Cardcom primary (Cardcom ישלח אחרי ה-webhook). אם paymentId לא
  // מועבר — fallback ל-skip-by-primary (שמרני, מתאים לקריאות ישירות
  // שאינן קשורות ל-Payment ספציפי).
  paymentId?: string | null;
}): Promise<void> {
  try {
    // ── מדיניות: skip מייל פנימי רק כשבטוח שצד שלישי (Cardcom) שלח ──────
    // Cardcom (כשהוא primary ויש לו CardcomInvoice לתשלום) שולח קבלה
    // רשמית עם מייל ללקוח. שליחת מייל פנימי במקביל יוצרת 2 הודעות מבלבלות.
    //
    // החלטה (context-aware):
    //   • יש CardcomInvoice לתשלום הזה (parent או child) → skip; Cardcom
    //     ישלח/שלח את הקבלה.
    //   • method=CREDIT_CARD + Cardcom primary + אין עדיין CardcomInvoice →
    //     זרם LowProfile pending; Cardcom יפיק/ישלח אחרי ה-webhook → skip.
    //   • כל מקרה אחר (cash/check/bank_transfer ללא CardcomInvoice, או
    //     CC דרך ספק אחר כמו Meshulam) → לא לדלג; שולחים מייל פנימי.
    //     זה מבטיח שהלקוח תמיד מקבל הודעת אישור על תשלום שלו, גם אם
    //     הפקת המסמך נכשלה ב-Cardcom או שהתשלום עבר דרך ספק שאינו שולח מייל.
    //
    // קלט paymentId מאפשר לבדוק CardcomInvoice של ה-Payment הספציפי. אם
    // לא הועבר (call sites ישנים) — fallback שמרני: skip אם Cardcom primary,
    // כדי לא לשבור את ההתנהגות הקיימת. כל call sites פעילים מעבירים
    // paymentId ולכן fallback זה כמעט לא נתפס.
    // ── ה-gate הזה צריך להיות עקבי עם issueReceipt — אם issueReceipt
    // הפעיל את מסלול Cardcom (כולל פלבק לבעל הקליניקה), מדלגים על המייל
    // הפנימי. בלי resolveCardcomReceiptOwner היינו שולחים מייל פנימי
    // נוסף בקליניקה שבה רק ה-OWNER חיבר Cardcom — Cardcom ישלח את שלו +
    // אנחנו את שלנו = 2 הודעות מבלבלות.
    let orgIdForReceipt: string | null = null;
    if (params.paymentId) {
      const orgForReceipt = await prisma.payment.findUnique({
        where: { id: params.paymentId },
        select: { organizationId: true },
      }).catch(() => null);
      orgIdForReceipt = orgForReceipt?.organizationId ?? null;
    }
    const cardcomReceiptOwner = await resolveCardcomReceiptOwner(
      params.userId,
      orgIdForReceipt,
    );
    const cardcomPrimaryUser = !!cardcomReceiptOwner;
    if (cardcomPrimaryUser) {
      let shouldSkip = false;
      if (params.paymentId) {
        try {
          // ── זיהוי האם Cardcom הוא הספק *בפועל* לתשלום הזה ──────────
          // Cardcom primary לבד לא מספיק: המטפל יכול להיות מחובר לכמה
          // ספקים (Meshulam/Sumit) במקביל, ותשלום נתון יכול לעבור דרך כל
          // אחד מהם. אנחנו מדלגים על המייל הפנימי רק אם ראיות בקוד מראות
          // ש-Cardcom הוא המנפיק / המעבד של התשלום הזה.
          //
          // ראיה 1 — CardcomInvoice ישיר על ה-paymentId / parent / children.
          // ראיה 2 — CardcomInvoice של Umbrella ב-bulk: ה-distribute מעתיק
          //          receiptNumber ל-children, ולכן payment.receiptNumber
          //          תואם ל-cardcomDocumentNumber של ה-Umbrella.
          // ראיה 3 — CardcomTransaction ישיר (LowProfile pending לפני webhook).
          //
          // Meshulam/Sumit-CC לא יצרו אף אחד מאלה → shouldSkip=false →
          // הלקוח מקבל את מייל ה-MyTipul הרגיל (אישור תשלום).
          const payment = await prisma.payment.findUnique({
            where: { id: params.paymentId },
            select: {
              id: true,
              receiptNumber: true,
              parentPaymentId: true,
              childPayments: {
                select: { id: true, receiptNumber: true },
              },
              parentPayment: {
                select: { id: true, receiptNumber: true },
              },
            },
          });

          const idsToCheck = new Set<string>([params.paymentId]);
          const receiptNumbers = new Set<string>();
          if (payment?.receiptNumber) receiptNumbers.add(payment.receiptNumber);
          if (payment?.parentPayment) {
            idsToCheck.add(payment.parentPayment.id);
            if (payment.parentPayment.receiptNumber) {
              receiptNumbers.add(payment.parentPayment.receiptNumber);
            }
          }
          if (payment?.childPayments) {
            for (const c of payment.childPayments) {
              idsToCheck.add(c.id);
              if (c.receiptNumber) receiptNumbers.add(c.receiptNumber);
            }
          }

          // ראיה 1+2 במכה אחת: או paymentId ישיר, או documentNumber של ה-Umbrella.
          const orFilters: Array<Record<string, unknown>> = [
            { paymentId: { in: Array.from(idsToCheck) } },
          ];
          if (receiptNumbers.size > 0) {
            orFilters.push({
              cardcomDocumentNumber: { in: Array.from(receiptNumbers) },
            });
          }
          const cardcomInvoice = await prisma.cardcomInvoice.findFirst({
            where: { OR: orFilters },
            select: { id: true },
          });

          if (cardcomInvoice) {
            shouldSkip = true;
          } else if (params.method === "CREDIT_CARD") {
            // CC + אין CardcomInvoice → ייתכן זרם Cardcom Low-Profile
            // pending (webhook עוד לא הגיע) או ספק CC אחר (Meshulam/Sumit).
            // נבדוק CardcomTransaction להבחין: יש ⇒ Cardcom יפיק וישלח
            // אחרי webhook. אין ⇒ ספק אחר ⇒ שולחים מייל פנימי כרגיל.
            const cardcomTx = await prisma.cardcomTransaction.findFirst({
              where: { paymentId: { in: Array.from(idsToCheck) } },
              select: { id: true },
            });
            shouldSkip = !!cardcomTx;
          } else {
            // Cash/check/transfer/Meshulam-CC בלי CardcomInvoice →
            // לא Cardcom הוא המעבד. שולחים מייל פנימי כדי שהלקוח יקבל
            // הודעת אישור גם כש-issueReceipt נכשל ב-Cardcom או שהתשלום
            // עבר דרך ספק אחר.
            shouldSkip = false;
          }
        } catch (lookupErr) {
          logger.warn("[sendPaymentReceiptEmail] Cardcom evidence lookup failed — sending email", {
            paymentId: params.paymentId,
            error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
          });
          shouldSkip = false;
        }
      } else {
        // אין paymentId — fallback שמרני (התנהגות מקורית: skip ל-Cardcom primary).
        shouldSkip = true;
      }
      if (shouldSkip) {
        logger.info("[sendPaymentReceiptEmail] skipped — Cardcom is the actual provider", {
          userId: params.userId,
          clientId: params.clientId,
          paymentId: params.paymentId,
        });
        return;
      }
    }

    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId: params.userId },
    });
    if (commSettings?.sendPaymentReceipt === false) return;

    const therapist = await prisma.user.findUnique({
      where: { id: params.userId },
    });
    const client = await prisma.client.findUnique({
      where: { id: params.clientId },
    });
    if (!client) return;

    // EXCLUDE_BULK_UMBRELLA_WHERE — Umbrella במצב PENDING (לפני webhook) יזיף
    // את חישוב remainingDebt למייל הקבלה. הסכום שלו ייספר ממילא דרך
    // ה-children אחרי PAID, אז עדיף לא לכלול אותו בחלון הזמני.
    const allPending = await prisma.payment.findMany({
      where: {
        AND: [
          EXCLUDE_BULK_UMBRELLA_WHERE,
          {
            clientId: params.clientId,
            status: "PENDING",
            parentPaymentId: null,
          },
        ],
      },
    });
    const remainingDebt = calculateDebtFromPayments(allPending);

    const sessionRemaining = params.sessionRemainingAfterPayment ?? (params.expectedAmount - params.amountPaid);

    const { subject, html } = createPaymentReceiptEmail({
      clientName: client.name,
      therapistName: therapist?.name || "המטפל/ת שלך",
      therapistPhone:
        therapist?.businessPhone || therapist?.phone || undefined,
      payment: {
        amount: params.amountPaid,
        expectedAmount: params.expectedAmount,
        method: params.method,
        paidAt: params.paidAt,
        sessionRemainingAfterPayment: Math.max(0, sessionRemaining),
        session: params.session || undefined,
        receiptUrl: params.receiptUrl || undefined,
        receiptNumber: params.receiptNumber || undefined,
      },
      clientBalance: {
        remainingDebt,
        credit: Number(client.creditBalance),
      },
      customization: {
        paymentInstructions: commSettings?.paymentInstructions,
        paymentLink: commSettings?.paymentLink,
        emailSignature: commSettings?.emailSignature,
        customGreeting: commSettings?.customGreeting,
        customClosing: commSettings?.customClosing,
        businessHours: commSettings?.businessHours,
      },
    });

    if (commSettings?.sendReceiptToClient !== false && client.email) {
      const emailResult = await sendEmail({ to: client.email, subject, html });
      // ⭐ רישום לפי תוצאה אמיתית — לא status SENT קשיח (מטעה במיוחד בשבת)
      await prisma.communicationLog.create({
        data: {
          type: "CUSTOM",
          channel: "EMAIL",
          recipient: client.email.toLowerCase(),
          subject,
          content: html,
          status: emailResult.success ? "SENT" : "FAILED",
          errorMessage: emailResult.success ? null : String(emailResult.error),
          sentAt: emailResult.success ? new Date() : null,
          messageId: emailResult.messageId || null,
          clientId: params.clientId,
          userId: params.userId,
        },
      });
    }

    if (commSettings?.sendReceiptToTherapist !== false && therapist?.email) {
      // משלוח עותק למטפל — לא נרשם ב-log (כבר נרשם ללקוח).
      // בשבת יחזור shabbatBlocked:true בשקט; במוצ"ש ניתן לשלוח ידנית אם רוצים.
      await sendEmail({
        to: therapist.email,
        subject: `[עותק] ${subject}`,
        html,
      });
    }
  } catch (err) {
    logger.error("Error sending payment receipt email", { error: err instanceof Error ? err.message : String(err) });
  }
}

// ================================================================
// notifyBulkClients — webhook/sync helper for bulk Cardcom flow
// ================================================================
// כשה-distributeBulkCardcomPayment מסיים בהצלחה, יש N children חדשים שכל
// אחד מייצג allocation אחר. לא נכון לקרוא ל-completeWebhookPayment(parentId)
// כי המייל ייקח את payment.amount של ה-parent (= ה-newTotal המצטבר אחרי
// שכל ה-allocations נוספו), לא את ה-allocation של אותה פגישה. גם לא נכון
// לקרוא עם childId כי ה-child לא יש לו session.
//
// במקום זה: עבור כל פריט ב-processed, טוען את ה-parent (לקבלת session +
// expectedAmount), ושולח sendPaymentReceiptEmail עם amountPaid=allocation
// המדויק. זה מתאים לחישוב הנכון של "כמה שילם לפגישה הזו".
//
// concurrency: ה-loop רץ סדרתית (await בכל איטרציה) כדי לא להציף את
// connection pool של Prisma או את rate limit של Resend ב-bulk גדול
// (50 paymentIds → 50 promises במקביל = ~200 queries + 50 emails ב-spike
// אחד). סדרתי = לאט יותר אבל בטוח.
export async function notifyBulkClients(
  userId: string,
  cardcomTransactionId: string,
  processed: Array<{
    parentId: string;
    childId: string;
    amountPaid: number;
    isFullyPaid: boolean;
  }>,
): Promise<void> {
  for (const item of processed) {
    if (item.amountPaid <= 0) continue;
    try {
      const parent = await prisma.payment.findUnique({
        where: { id: item.parentId },
        include: {
          session: { select: { startTime: true, type: true } },
          client: { select: { id: true } },
        },
      });
      if (!parent || !parent.client) continue;

      // Re-fetch the child to get the canonical receiptNumber/Url (set by
      // distribute as inheritance from umbrella). Falling back to parent
      // values if for some reason the child lacks them.
      const child = await prisma.payment.findUnique({
        where: { id: item.childId },
        select: { receiptNumber: true, receiptUrl: true },
      });

      const expectedAmount = Number(parent.expectedAmount) || item.amountPaid;
      const sessionRemaining = item.isFullyPaid
        ? 0
        : Math.max(0, expectedAmount - Number(parent.amount));

      await sendPaymentReceiptEmail({
        userId,
        clientId: parent.client.id,
        amountPaid: item.amountPaid,
        expectedAmount,
        method: "CREDIT_CARD",
        paidAt: new Date(),
        session: parent.session ?? null,
        receiptUrl: child?.receiptUrl ?? parent.receiptUrl,
        receiptNumber: child?.receiptNumber ?? parent.receiptNumber,
        sessionRemainingAfterPayment: sessionRemaining,
        paymentId: item.childId ?? item.parentId,
      });
    } catch (err) {
      logger.error("[notifyBulkClients] failed for one child", {
        cardcomTransactionId,
        parentId: item.parentId,
        childId: item.childId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ================================================================
// completeWebhookPayment - called by webhooks after updating Payment
// Sends receipt email + completes COLLECT_PAYMENT task
// This is the "connector pipe" between webhooks and the payment trunk
// ================================================================

export async function completeWebhookPayment(paymentId: string): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        session: { select: { startTime: true, type: true } },
        client: { select: { id: true, therapistId: true } },
      },
    });

    if (!payment || !payment.client) return;

    const { client } = payment;

    // 1. Send receipt email to client (respects therapist's communication settings)
    await sendPaymentReceiptEmail({
      userId: client.therapistId,
      clientId: client.id,
      amountPaid: Number(payment.amount),
      expectedAmount: Number(payment.expectedAmount),
      method: payment.method,
      paidAt: payment.paidAt || new Date(),
      session: payment.session,
      receiptUrl: payment.receiptUrl,
      receiptNumber: payment.receiptNumber,
      paymentId: payment.id,
    }).catch(err => logger.error("Webhook receipt email failed", { error: err instanceof Error ? err.message : String(err) }));

    // 2. Complete COLLECT_PAYMENT task if this payment is now fully paid
    if (payment.status === "PAID") {
      await prisma.task.updateMany({
        where: {
          userId: client.therapistId,
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
          relatedEntityId: paymentId,
        },
        data: { status: "COMPLETED" },
      });
    }
  } catch (err) {
    // Non-critical: webhook already updated the payment, this is supplementary
    logger.error("completeWebhookPayment error", { error: err instanceof Error ? err.message : String(err) });
  }
}

// ================================================================
// Helpers
// ================================================================

export function buildReceiptDescription(
  session: { startTime: Date } | null | undefined,
  isPartial: boolean,
  amountPaid: number,
  expectedAmount: number
): string {
  const sessionDate = session
    ? new Date(session.startTime).toLocaleDateString("he-IL", {
        timeZone: "Asia/Jerusalem",
      })
    : null;
  let desc = sessionDate
    ? `תשלום עבור פגישה בתאריך ${sessionDate}`
    : `תשלום עבור טיפול`;
  if (isPartial) {
    desc += ` (תשלום חלקי - ₪${amountPaid} מתוך ₪${expectedAmount})`;
  }
  return desc;
}

// ================================================================
// buildCombinedReceiptDescription — תיאור לקבלה אחת מאוחדת (תשלום מצרפי)
// ================================================================
// כשמפיקים קבלה אחת על כמה פגישות (combinedReceipt), בונים תיאור שמפרט שורה
// לכל פגישה (תאריך: ₪סכום) + סה"כ — מתאים להחזרים מקופ"ח/ביטוח. משמש כברירת
// מחדל כשהמשתמש/ת לא הקליד/ה תיאור משלו. שורות מופרדות ב-\n; דף הקבלה הפנימי
// מציג עם white-space: pre-line, ול-Cardcom/iCount זה עובר כתיאור המסמך.
export function buildCombinedReceiptDescription(
  lines: Array<{ date: Date | null; amount: number }>
): string {
  const count = lines.length;
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const header = `תשלום מצרפי עבור ${count} פגישות`;
  const items = lines.map((l) => {
    const dateStr = l.date
      ? new Date(l.date).toLocaleDateString("he-IL", {
          timeZone: "Asia/Jerusalem",
        })
      : "פגישה";
    return `${dateStr}: ₪${l.amount.toLocaleString("he-IL")}`;
  });
  return `${header}\n${items.join("\n")}\nסה"כ: ₪${total.toLocaleString("he-IL")}`;
}
