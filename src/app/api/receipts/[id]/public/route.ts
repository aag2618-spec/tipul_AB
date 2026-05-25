import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyReceiptToken } from "@/lib/receipt-token";
import { logger } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit-logger";
import { checkRateLimit, RECEIPT_PUBLIC_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`receipt-public:${ip}`, RECEIPT_PUBLIC_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    const token = request.nextUrl.searchParams.get("t");

    // M10.8: רק v=1 (32 hex chars / 128 bit) — legacy v=0 (96-bit) הוסר.
    // סינון מקדים כדי לחסוך findUnique על input זדוני.
    if (!token || token.length !== 32) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    // סבב 8: טוענים קודם את ה-payment כדי לקבל את receiptTokenVersion, ורק
    // אז מאמתים. בלי זה, verifyReceiptToken היה מקבל גם 24 וגם 32 לכל payment
    // ותוקף היה יכול להגדיר downgrade ל-96-bit על קבלות חדשות.
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        session: { select: { startTime: true, type: true } },
        parentPayment: {
          select: {
            expectedAmount: true,
            amount: true,
            session: { select: { startTime: true } },
            childPayments: {
              select: { id: true, amount: true, paidAt: true, createdAt: true },
              orderBy: { paidAt: "asc" as const },
            },
          },
        },
        childPayments: { select: { amount: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ message: "קבלה לא נמצאה" }, { status: 404 });
    }

    // M10.8: verifyReceiptToken מאמת 128-bit only. receiptTokenVersion ב-DB
    // כבר לא משפיע — נשמר ב-schema לתאימות עתידית.
    try {
      if (!verifyReceiptToken(id, token)) {
        return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    // M10.1: PHI access trail — תקנות הגנת הפרטיות (2017) דורשות תיעוד של גישה
    // למידע רפואי. גישה ציבורית-אנונימית דרך token: userId=null, snapshot
    // IP+userAgent + meta עם paymentId/clientId/version. נקרא רק אחרי שהtoken
    // עבר אימות — אחרת בכל probe יהיה רישום (DoS על הטבלה).
    logDataAccess({
      userId: null,
      recordType: "PAYMENT",
      recordId: id,
      action: "READ",
      clientId: payment.clientId,
      request,
      meta: {
        accessSource: "receipt_public_link",
        tokenVersion: payment.receiptTokenVersion,
      },
    });

    const therapist = await prisma.user.findFirst({
      where: { clients: { some: { id: payment.clientId } } },
      select: {
        name: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
      },
    });

    let amount = Number(payment.amount);

    // Legacy fix: receipt on parent whose amount grew with subsequent partials
    if (
      !payment.parentPaymentId &&
      payment.childPayments &&
      payment.childPayments.length > 0
    ) {
      const childSum = payment.childPayments.reduce(
        (s, c) => s + Number(c.amount),
        0
      );
      const originalAmount = Number(payment.amount) - childSum;
      if (originalAmount > 0) amount = originalAmount;
    }

    const sessionExpectedAmount = payment.parentPaymentId
      ? Number(payment.parentPayment?.expectedAmount || payment.expectedAmount || amount)
      : Number(payment.expectedAmount || amount);

    let remaining = 0;
    if (payment.parentPaymentId && payment.parentPayment) {
      const siblings = payment.parentPayment.childPayments || [];
      let cumulativePaid = 0;
      for (const sib of siblings) {
        cumulativePaid += Number(sib.amount);
        if (sib.id === payment.id) break;
      }
      remaining = Math.max(0, sessionExpectedAmount - cumulativePaid);
    } else {
      remaining = Math.max(0, sessionExpectedAmount - amount);
    }

    const isPartial = remaining > 0;

    const sessionDate = payment.session?.startTime 
      || payment.parentPayment?.session?.startTime 
      || null;

    return NextResponse.json({
      receiptNumber: payment.receiptNumber,
      amount,
      expectedAmount: sessionExpectedAmount,
      method: payment.method,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      clientName: payment.client.name,
      sessionDate,
      receiptUrl: payment.receiptUrl,
      isPartial,
      remaining,
      therapist: {
        name: therapist?.name || "",
        businessName: therapist?.businessName || "",
        phone: therapist?.businessPhone || "",
        address: therapist?.businessAddress || "",
      },
    });
  } catch (error) {
    logger.error("Public receipt error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאה בטעינת הקבלה" }, { status: 500 });
  }
}
