import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { createPaymentForSession } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/validations/helpers";
import { createPaymentSchema } from "@/lib/validations/payment";
import { serializePrisma } from "@/lib/serialize";
import {
  buildClientWhere,
  buildPaymentWhere,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    const paymentWhere = buildPaymentWhere(scopeUser);

    // EXCLUDE_BULK_UMBRELLA_WHERE — מסנן Umbrella payments של תשלום מצרפי
    // באשראי. ה-Umbrella יוצר CardcomInvoice משלו ולכן יוצג כקבלה כפולה
    // ב-/dashboard/receipts.
    //
    // OR-clause לתרחיש partial-cash + Cardcom completion:
    //   • כל ה-parents (parentPaymentId: null) — חלקם עם hasReceipt משלהם
    //     (Cardcom completion), חלקם עם merge מ-children (bulk distribution).
    //   • + children שיש להם receipt **ולא** מ-bulk distribution — אלו children
    //     שנוצרו ע"י issueReceipt על תשלום חלקי במזומן/צ'ק. אם נסתיר אותם,
    //     הקבלה הראשונית של המזומן נעלמת מהתצוגה כש-parent מתקבל ב-Cardcom.
    //   • מסננים children של "Bulk Cardcom distribution" — אלו מוצגים דרך
    //     merge של ה-parent (שורה אחת לכל פגישה במצרפי).
    const payments = await prisma.payment.findMany({
      where: {
        AND: [
          paymentWhere,
          EXCLUDE_BULK_UMBRELLA_WHERE,
          {
            OR: [
              { parentPaymentId: null },
              {
                // partial-cash children: hasReceipt=true, notes=null. ב-Postgres
                // `NOT (notes LIKE '%...%')` עם notes=null מחזיר NULL, ו-WHERE
                // מסנן NULL כאילו זה FALSE → ה-children הללו היו נסתרים בטעות
                // (אותו NULL trap שתועד ב-EXCLUDE_BULK_UMBRELLA_WHERE ב-types.ts).
                // הפתרון: OR מפורש שמתיר notes=null.
                AND: [
                  { parentPaymentId: { not: null } },
                  { hasReceipt: true },
                  {
                    OR: [
                      { notes: null },
                      { notes: { not: { contains: "Bulk Cardcom distribution" } } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        session: { select: { id: true, startTime: true } },
        // Parent reference — children of partial-cash flows don't have their
        // own session/client (they hang off a parent that does). The merge
        // below copies these onto the child for display purposes.
        parentPayment: {
          select: {
            client: { select: { id: true, name: true } },
            session: { select: { id: true, startTime: true } },
          },
        },
        // Children carry the canonical receipt info for bulk-Cardcom flows
        // (umbrella's receiptNumber/Url is propagated to each child by
        // distributeBulkCardcomPayment). For non-bulk flows the parent itself
        // holds the receipt and childPayments is empty — the merge below
        // handles both.
        childPayments: {
          select: {
            id: true,
            amount: true,
            hasReceipt: true,
            receiptNumber: true,
            receiptUrl: true,
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
          orderBy: { paidAt: "asc" },
        },
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

    // Merge logic — three cases:
    //   1. Child of partial-cash (parentPaymentId set + hasReceipt) → copy
    //      parent's session/client onto it for display, then return as-is.
    //   2. Parent without own receipt but with bulk-Cardcom child → merge
    //      child's receipt up (1 row per session for bulk).
    //   3. Parent with own receipt → return as-is (regular payment).
    //
    // NOTE: לא מחסרים כאן sums מ-children. הצד הלקוח (receipts/page.tsx
    // ב-getReceiptDisplayAmount + buildReceiptExportData) כבר מטפל בחיסור
    // לתצוגה: כש-parent.amount הוא ה-roll-up (350) וצריך להציג את החלק
    // המקורי שלו (200), הלקוח מחסר את סכום ה-children מהשורה של ה-parent.
    // חיסור גם בשרת ייצור double-subtract → הצגה שגויה (50 במקום 200).
    let merged = payments.map((p) => {
      if (p.parentPaymentId) {
        return {
          ...p,
          session: p.session ?? p.parentPayment?.session ?? null,
          client: p.parentPayment?.client ?? p.client,
        };
      }
      if (p.hasReceipt) return p;
      const childWithReceipt = p.childPayments.find((c) => c.hasReceipt);
      if (!childWithReceipt) return p;
      return {
        ...p,
        hasReceipt: true,
        receiptNumber: p.receiptNumber ?? childWithReceipt.receiptNumber,
        receiptUrl: p.receiptUrl ?? childWithReceipt.receiptUrl,
        cardcomInvoices:
          p.cardcomInvoices.length > 0
            ? p.cardcomInvoices
            : childWithReceipt.cardcomInvoices,
      };
    });

    // Bulk-Cardcom backfill — ה-CardcomInvoice של ה-Umbrella אוצר את המסמך
    // החוקי (cardcomDocumentNumber UNIQUE → לא יכול להיות מקושר ל-2 Payments
    // דרך paymentId). ה-children ירשו receiptNumber/receiptUrl ב-distribute,
    // אבל ה-cardcomInvoices שלהם ריק → דף הקבלות יציג "הופקה" + "הורד PDF"
    // (קבלה פנימית) במקום "Cardcom צפה". זה גם UX רע וגם לא תקין משפטית —
    // Cardcom הוא המנפיק החוקי. הפתרון: מעמיסים את ה-CardcomInvoice של
    // ה-Umbrella דרך cardcomDocumentNumber התואם ל-receiptNumber של ה-parent.
    const orphanReceiptNumbers = merged
      .filter((p) => p.hasReceipt && p.receiptNumber && p.cardcomInvoices.length === 0)
      .map((p) => p.receiptNumber!)
      .filter((n, i, a) => a.indexOf(n) === i);
    if (orphanReceiptNumbers.length > 0) {
      const umbrellaInvoices = await prisma.cardcomInvoice.findMany({
        where: { cardcomDocumentNumber: { in: orphanReceiptNumbers } },
        select: {
          id: true,
          cardcomDocumentNumber: true,
          cardcomDocumentType: true,
          pdfUrl: true,
          viewUrl: true,
        },
      });
      const invoiceByNumber = new Map(
        umbrellaInvoices.map((inv) => [inv.cardcomDocumentNumber, inv]),
      );
      merged = merged.map((p) => {
        if (
          p.hasReceipt &&
          p.receiptNumber &&
          p.cardcomInvoices.length === 0 &&
          invoiceByNumber.has(p.receiptNumber)
        ) {
          return { ...p, cardcomInvoices: [invoiceByNumber.get(p.receiptNumber)!] };
        }
        return p;
      });
    }

    return NextResponse.json(serializePrisma(merged));
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

    // ⚠️ userId לקבלות חייב להיות של המטפל בעל הלקוח (billing owner),
    // לא של המזכירה. החבילה billing/Cardcom של המטפל היא זו שמנפיקה,
    // והקבלה חייבת לשאת את זהותו (חוק חשבוניות 2024).
    const clientForBilling = await prisma.client.findFirst({
      where: { id: clientId, ...buildClientWhere(scopeUser) },
      select: { therapistId: true },
    });
    const billingUserId = clientForBilling?.therapistId ?? userId;

    const result = await createPaymentForSession({
      userId: billingUserId,
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
