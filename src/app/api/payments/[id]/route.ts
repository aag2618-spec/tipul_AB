import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addPartialPayment, markFullyPaid } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const payment = await prisma.payment.findFirst({
      where: { id, client: { therapistId: userId } },
      include: {
        client: true,
        session: true,
      },
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
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { status, method, notes, amount, creditUsed, issueReceipt, prepareCardcom } = body;

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
        where: { id, client: { therapistId: userId } },
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
      const expected = Number(existing.expectedAmount) || 0;
      if (expected > 0 && desired > expected + 0.001) {
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
        where: { id, client: { therapistId: userId }, status: "PENDING" },
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
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        // ownership נבדק כבר ב-addPartialPayment service. עוטפים ב-updateMany
        // עם ownership ב-WHERE כdefense-in-depth מפני race condition.
        await prisma.payment.updateMany({
          where: { id, client: { therapistId: userId } },
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
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        await prisma.payment.updateMany({
          where: { id, client: { therapistId: userId } },
          data: { notes },
        });
      }

      return NextResponse.json(serializePrisma({
        ...result.payment,
        receiptError: result.receiptError,
      }));
    }

    // Simple field update (status change, notes, method — no payment action)
    // Atomic — ownership ב-WHERE מונע race condition / IDOR.
    const updateResult = await prisma.payment.updateMany({
      where: { id, client: { therapistId: userId } },
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

