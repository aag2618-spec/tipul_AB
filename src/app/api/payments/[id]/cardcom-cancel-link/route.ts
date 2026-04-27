// src/app/api/payments/[id]/cardcom-cancel-link/route.ts
// USER-tenant — מטפל מבטל קישור תשלום שכבר נשלח (לקוח עוד לא שילם).
//
// תרחישי השימוש:
//   1) שלחתי קישור לסכום/לקוח לא נכון.
//   2) הלקוח כבר שילם במזומן בינתיים.
//   3) שינוי דעת.
//
// הזרימה:
//   • מאתר את ה-CardcomTransaction ב-PENDING של ה-Payment (USER tenant).
//   • Serializable: בודק שוב שהסטטוס PENDING ומסמן ל-CANCELLED.
//   • אם בינתיים העסקה הפכה ל-APPROVED → 409 ("התשלום כבר התקבל").
//
// הערה: לא קוראים ל-Cardcom CancelByLowProfile — קישור ה-LowProfile
// מצד Cardcom פג בתוך כ-30 דקות ממילא. הגנה אמיתית: מצד שלנו ה-webhook
// מסרב לעדכן עסקה שמסומנת CANCELLED ל-APPROVED ויוצר אזהרה אם הלקוח
// ניסה לשלם בכל זאת — ראו `webhooks/cardcom/user/route.ts`.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface CancelBody {
  /** מזהה ספציפי של CardcomTransaction לבטל (אופציונלי). אם חסר — ה-PENDING האחרון. */
  transactionId?: string;
  /** סיבת ביטול חופשית (לאודיט בלבד). */
  reason?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  const { id: paymentId } = await context.params;

  // Idempotency — לחיצה כפולה על "בטל קישור" לא תיצור שתי פעולות.
  // המפתח חייב לכלול route+paymentId כדי לא לקבל replay מ-route אחר.
  const idempotencyKey =
    request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  const idempotencyDbKey = idempotencyKey
    ? `${userId}:POST:/api/payments/${paymentId}/cardcom-cancel-link:${idempotencyKey}`
    : null;
  if (idempotencyDbKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyDbKey },
    });
    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json(existing.response, { status: existing.statusCode });
    }
  }

  let body: CancelBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as CancelBody;
  } catch {
    body = {};
  }
  const reason = (body.reason ?? "").slice(0, 500);

  let payment;
  try {
    payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { client: { select: { id: true, therapistId: true } } },
    });
  } catch (dbErr) {
    logger.error("[payments/cardcom-cancel-link] DB load failed", {
      paymentId,
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    return NextResponse.json({ message: "שגיאה בטעינת פרטי תשלום" }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }
  if (payment.client.therapistId !== userId) {
    return NextResponse.json({ message: "אין הרשאה לבטל קישור זה" }, { status: 403 });
  }

  // איתור עסקה לביטול. אם המשתמש שלח transactionId נצמד אליו (תרחיש: ביטול ספציפי
  // מההיסטוריה כש-Payment היה כבר עם כמה ניסיונות). אחרת — ה-PENDING האחרון.
  let preTx;
  try {
    preTx = body.transactionId
      ? await prisma.cardcomTransaction.findFirst({
          where: {
            id: body.transactionId,
            paymentId: payment.id,
            tenant: "USER",
            userId,
          },
          select: { id: true, status: true, lowProfileId: true },
        })
      : await prisma.cardcomTransaction.findFirst({
          where: {
            paymentId: payment.id,
            tenant: "USER",
            userId,
            status: "PENDING",
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, lowProfileId: true },
        });
  } catch (dbErr) {
    logger.error("[payments/cardcom-cancel-link] tx lookup failed", {
      paymentId,
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    return NextResponse.json({ message: "שגיאה בטעינת עסקה" }, { status: 500 });
  }

  if (!preTx) {
    return NextResponse.json(
      { message: "לא נמצא קישור פעיל לבטל. ייתכן שהקישור כבר פג, בוטל, או שהתשלום כבר התקבל." },
      { status: 404 }
    );
  }
  if (preTx.status === "APPROVED") {
    return NextResponse.json(
      { message: "התשלום כבר התקבל — לא ניתן לבטל את הקישור." },
      { status: 409 }
    );
  }
  if (preTx.status === "CANCELLED") {
    // כבר בוטל — תגובה אידמפוטנטית ידידותית.
    return NextResponse.json({ success: true, alreadyCancelled: true });
  }
  if (preTx.status !== "PENDING") {
    // DECLINED/FAILED/EXPIRED/REFUNDED — אין מה לבטל. נחזיר תשובה ברורה.
    return NextResponse.json(
      { message: `העסקה במצב ${preTx.status} ולא ניתן לבטל אותה.` },
      { status: 409 }
    );
  }

  // ── Serializable claim: עוצרים race עם webhook שמגיע באותו רגע ──
  // בדיקה חוזרת של PENDING בתוך טרנזקציה ועדכון אטומי. אם המקביל קדם —
  // תיזרק שגיאה ונחזיר 409.
  let cancelled;
  try {
    cancelled = await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.cardcomTransaction.findUnique({
          where: { id: preTx.id },
          select: { id: true, status: true, lowProfileId: true },
        });
        if (!fresh) throw new Error("TX_GONE");
        if (fresh.status === "APPROVED") throw new Error("ALREADY_PAID");
        if (fresh.status === "CANCELLED") {
          return { id: fresh.id, alreadyCancelled: true as const };
        }
        if (fresh.status !== "PENDING") {
          throw new Error(`STATUS_${fresh.status}`);
        }
        const updated = await tx.cardcomTransaction.update({
          where: { id: fresh.id },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            errorMessage: reason
              ? `בוטל ע״י המטפל: ${reason}`
              : "בוטל ע״י המטפל",
          },
          select: { id: true },
        });
        return { id: updated.id, alreadyCancelled: false as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ALREADY_PAID") {
      return NextResponse.json(
        { message: "התשלום כבר התקבל — לא ניתן לבטל את הקישור." },
        { status: 409 }
      );
    }
    if (msg === "TX_GONE") {
      return NextResponse.json(
        { message: "העסקה לא נמצאה (כנראה נמחקה)." },
        { status: 404 }
      );
    }
    if (msg.startsWith("STATUS_")) {
      return NextResponse.json(
        { message: `העסקה במצב ${msg.replace("STATUS_", "")} ולא ניתן לבטל אותה.` },
        { status: 409 }
      );
    }
    const code = (err as { code?: string })?.code;
    if (code === "P2034" || code === "40001") {
      return NextResponse.json(
        { message: "המערכת עמוסה — נסי שוב בעוד רגע." },
        { status: 503 }
      );
    }
    logger.error("[payments/cardcom-cancel-link] cancel failed", {
      userId,
      paymentId,
      txId: preTx.id,
      error: msg,
    });
    return NextResponse.json({ message: "שגיאה בביטול הקישור" }, { status: 500 });
  }

  // אודיט מחוץ ל-Serializable כדי לא להחזיק נעילות מיותר. אם נכשל זה
  // לא הופך את הביטול לבלתי-תקף; רק מתעדים לוג שגיאה.
  try {
    await withAudit(
      { kind: "user", session },
      {
        action: "cardcom_user_cancel_link",
        targetType: "cardcom_transaction",
        targetId: cancelled.id,
        details: {
          paymentId,
          alreadyCancelled: cancelled.alreadyCancelled,
          reason: reason || null,
          lowProfileId: preTx.lowProfileId ?? null,
        },
      },
      async () => undefined
    );
  } catch (auditErr) {
    logger.error("[payments/cardcom-cancel-link] audit log failed (non-fatal)", {
      userId,
      paymentId,
      txId: cancelled.id,
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  const responsePayload = { success: true, alreadyCancelled: cancelled.alreadyCancelled };

  if (idempotencyDbKey) {
    try {
      await prisma.idempotencyKey.create({
        data: {
          key: idempotencyDbKey,
          method: "POST",
          path: `/api/payments/${paymentId}/cardcom-cancel-link`,
          statusCode: 200,
          response: responsePayload,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    } catch (storeErr) {
      if (
        storeErr instanceof Prisma.PrismaClientKnownRequestError &&
        storeErr.code === "P2002"
      ) {
        // race-duplicate — שני קליקים, אותה תוצאה.
      } else {
        logger.error("[payments/cardcom-cancel-link] idempotency store failed", {
          userId,
          paymentId,
          error: storeErr instanceof Error ? storeErr.message : String(storeErr),
        });
      }
    }
  }

  return NextResponse.json(responsePayload);
}
