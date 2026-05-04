import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { createPaymentForSession } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/validations/helpers";
import { createPaymentSchema } from "@/lib/validations/payment";
import { serializePrisma } from "@/lib/serialize";
import {
  buildPaymentWhere,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    const paymentWhere = buildPaymentWhere(scopeUser);

    const payments = await prisma.payment.findMany({
      where: paymentWhere,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        session: { select: { id: true, startTime: true } },
        // Surface CardcomInvoice metadata so the receipts page can show
        // Cardcom-issued documents as such (badge + link to Cardcom's PDF)
        // instead of generating an internal PDF that misrepresents Cardcom's
        // receipt number — Cardcom is the legal issuer when the payment
        // went through them, and our internal PDF is not the authoritative
        // document.
        cardcomInvoices: {
          orderBy: { issuedAt: "desc" },
          take: 1,
          select: {
            id: true,
            cardcomDocumentNumber: true,
            cardcomDocumentType: true,
            pdfUrl: true,
            viewUrl: true,
          },
        },
      },
    });

    return NextResponse.json(serializePrisma(payments));
  } catch (error) {
    logger.error("Get payments error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת התשלומים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    // יצירת תשלום ע"י מזכירה דורשת canViewPayments — יצירה מחייבת צפייה.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה/יצירת תשלומים" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createPaymentSchema);
    if ("error" in parsed) return parsed.error;
    const {
      clientId,
      sessionId,
      amount,
      expectedAmount,
      paymentType,
      method,
      status,
      notes,
      creditUsed,
      issueReceipt,
    } = parsed.data;

    // הוצאת קבלה (issueReceipt=true) מחייבת canIssueReceipts אצל מזכירה.
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

    const result = await createPaymentForSession({
      userId,
      clientId,
      sessionId,
      amount: Number(amount),
      expectedAmount: Number(expectedAmount || amount),
      method: method || "CASH",
      paymentType: paymentType ?? "FULL",
      status,
      issueReceipt,
      notes,
      creditUsed: creditUsed ? Number(creditUsed) : undefined,
      scopeUser,
    });

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json(
      serializePrisma({ ...result.payment, receiptError: result.receiptError }),
      { status: 201 }
    );
  } catch (error) {
    logger.error("Create payment error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת התשלום" },
      { status: 500 }
    );
  }
}
