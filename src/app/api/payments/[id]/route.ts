import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addPartialPayment, markFullyPaid } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { serializePrisma } from "@/lib/serialize";
import {
  buildPaymentWhere,
  getClientSafeSelectForSecretary,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    const paymentWhere = buildPaymentWhere(scopeUser);

    // include role-aware: למזכירה חושפים שדות אדמיניסטרטיביים בלבד —
    // ללא session.notes, session.topic, וללא סיבות ביטול (תוכן קליני).
    // Client נטען דרך safe-select הקיים שמסיר notes/intakeNotes וכו'.
    const secretaryInclude = {
      client: { select: getClientSafeSelectForSecretary() },
      session: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          type: true,
          status: true,
          price: true,
        },
      },
    } as const;
    const fullInclude = { client: true, session: true } as const;

    const payment = await prisma.payment.findFirst({
      where: { AND: [{ id }, paymentWhere] },
      include: isSecretary(scopeUser) ? secretaryInclude : fullInclude,
    });

    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(serializePrisma(payment));
  } catch (error) {
    logger.error("Get payment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת התשלום" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    const body = await request.json();
    const { status, method, notes, amount, creditUsed, issueReceipt, prepareCardcom } = body;

    const scopeUser = await loadScopeUser(userId);
    const paymentWhere = buildPaymentWhere(scopeUser);

    // עדכון תשלום ע"י מזכירה דורש canViewPayments — שינוי תשלום מחייב צפייה.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה/עדכון תשלומים" },
        { status: 403 }
      );
    }

    // הוצאת קבלה אצל מזכירה — דורשת canIssueReceipts.
    if (
      issueReceipt &&
      isSecretary(scopeUser) &&
      !secretaryCan(scopeUser, "canIssueReceipts")
    ) {
      return NextResponse.json(
        { message: "אין הרשאה להוצאת קבלות" },
        { status: 403 }
      );
    }

    // ── prepareCardcom flow ────────────────────────────────────
    // עדכון מקדים של תשלום קיים לפני פתיחת ChargeCardcomDialog: מעדכן את
    // השדות `amount` ו-`method` בלבד, ללא טריגר ל-addPartialPayment שיוצר
    // ילד "PAID". הסטטוס נשאר PENDING — webhook של Cardcom יעדכן ל-PAID
    // לאחר הסליקה האמיתית.
    //
    // מותר רק על תשלום PENDING של המטפל המחובר. לא נוגעים ב-children
    // ולא יוצרים אודיט מורכב — זה מצב מעבר בלבד.
    if (prepareCardcom === true) {
      const desired = Number(amount);
      if (!Number.isFinite(desired) || desired <= 0) {
        return NextResponse.json({ message: "סכום לא תקין" }, { status: 400 });
      }
      const existing = await prisma.payment.findFirst({
        where: { AND: [{ id }, paymentWhere] },
        select: { id: true, status: true, expectedAmount: true, amount: true },
      });
      if (!existing) {
        return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
      }
      if (existing.status !== "PENDING") {
        return NextResponse.json(
          { message: "אפשר להכין לסליקה רק תשלום PENDING" },
          { status: 409 }
        );
      }
      // CRITICAL: לא לדרוס סכום מצטבר. אם payment.amount > 0 כבר נצברו
      // תשלומים חלקיים (מזומן/בנק) → דריסה תאבד את ההיסטוריה ותשבור
      // את חישוב החוב. עד שננתב partial-cardcom דרך addPartialPayment,
      // חוסמים זאת ברמת ה-API (defense-in-depth מעל החסימה ב-UI).
      const currentAmount = Number(existing.amount) || 0;
      if (currentAmount > 0) {
        return NextResponse.json(
          {
            message:
              "כבר נרשמו תשלומים על חוב זה. סליקת אשראי על שארית טרם נתמכת.",
          },
          { status: 409 }
        );
      }
      // הגנה: לא לאפשר חיוב מעל הסכום המצופה.
      // CRITICAL: אם expectedAmount <= 0, חוסמים את prepareCardcom לחלוטין
      // (ולא רק "מדלגים על הבדיקה"). expectedAmount=0 משמעו תשלום בלי יעד
      // מוגדר — לקוח מזויף יכול היה להעלות desired לכל סכום. כל מסלול
      // שיוצר Payment דרך ה-UI מציב expectedAmount = amount או price,
      // ולכן 0 הוא אינדיקציה לתשלום פגום או למניפולציה.
      const expected = Number(existing.expectedAmount) || 0;
      if (expected <= 0) {
        return NextResponse.json(
          {
            message:
              "תשלום ללא סכום מצופה (expectedAmount=0) לא נתמך לסליקת אשראי. צור תשלום חדש עם סכום מוגדר.",
          },
          { status: 409 }
        );
      }
      if (desired > expected + 0.001) {
        return NextResponse.json(
          { message: `סכום החיוב חורג מהמצופה (₪${expected})` },
          { status: 400 }
        );
      }
      // עוד הגנה: אם כבר קיים CardcomTransaction PENDING/APPROVED על
      // ה-Payment הזה, אסור לשנות את הסכום מתחת לרגליו של חיוב פעיל.
      // ה-charge-cardcom יחסום בעצמו, אבל עדיף להחזיר שגיאה ברורה כאן.
      const inFlightTx = await prisma.cardcomTransaction.findFirst({
        where: {
          paymentId: id,
          tenant: "USER",
          status: { in: ["PENDING", "APPROVED"] },
        },
        select: { id: true, status: true },
      });
      if (inFlightTx) {
        return NextResponse.json(
          {
            message:
              inFlightTx.status === "APPROVED"
                ? "התשלום כבר שולם"
                : "כבר קיים חיוב פתוח לתשלום זה. בטלי אותו לפני הכנה מחדש.",
          },
          { status: 409 }
        );
      }
      // Atomic update — ownership נבדק ב-WHERE, מונע race condition
      const updateResult = await prisma.payment.updateMany({
        where: { AND: [{ id }, paymentWhere, { status: "PENDING" }] },
        data: {
          amount: desired,
          method: "CREDIT_CARD",
        },
      });
      if (updateResult.count === 0) {
        return NextResponse.json(
          { message: "תשלום לא נמצא או שהסטטוס שונה" },
          { status: 404 }
        );
      }
      // include client + session — frontend מצפה לזה (mark-paid page וכו')
      const updated = await prisma.payment.findUnique({
        where: { id },
        include: { client: true, session: true },
      });
      return NextResponse.json(serializePrisma(updated));
    }

    // Adding a payment amount (partial or completing)
    if (amount !== undefined) {
      const result = await addPartialPayment({
        userId: userId,
        parentPaymentId: id,
        amount: Number(amount),
        method: method || "CASH",
        issueReceipt,
        creditUsed: creditUsed ? Number(creditUsed) : undefined,
        scopeUser,
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        // ownership נבדק כבר ב-addPartialPayment service. עוטפים ב-updateMany
        // עם scope ב-WHERE כdefense-in-depth מפני race condition.
        await prisma.payment.updateMany({
          where: { AND: [{ id }, paymentWhere] },
          data: { notes },
        });
      }

      return NextResponse.json(serializePrisma({
        ...result.payment,
        receiptError: result.receiptError,
      }));
    }

    // Marking as fully paid (no specific amount)
    if (status === "PAID") {
      const result = await markFullyPaid({
        userId: userId,
        paymentId: id,
        method: method || "CASH",
        issueReceipt,
        creditUsed: creditUsed ? Number(creditUsed) : undefined,
        scopeUser,
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        await prisma.payment.updateMany({
          where: { AND: [{ id }, paymentWhere] },
          data: { notes },
        });
      }

      return NextResponse.json(serializePrisma({
        ...result.payment,
        receiptError: result.receiptError,
      }));
    }

    // Simple field update (status change, notes, method — no payment action)
    // Atomic — scope ב-WHERE מונע race condition / IDOR.
    const updateResult = await prisma.payment.updateMany({
      where: { AND: [{ id }, paymentWhere] },
      data: {
        status: status || undefined,
        method: method || undefined,
        notes: notes !== undefined ? notes : undefined,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    // include client + session לשמור על תאימות עם ה-frontend
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { client: true, session: true },
    });
    return NextResponse.json(serializePrisma(payment));
  } catch (error) {
    logger.error("Update payment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}

