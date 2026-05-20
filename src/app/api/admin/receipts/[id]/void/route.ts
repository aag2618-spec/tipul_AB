// src/app/api/admin/receipts/[id]/void/route.ts
// ביטול קבלה — קורא ל-Cardcom Documents/Void ומעדכן מקומית.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getAdminCardcomConfig } from "@/lib/cardcom/admin-config";
import { voidCardcomDocument } from "@/lib/cardcom/invoice-api";
import { parseOptionalBody } from "@/lib/validations/helpers";
import { receiptVoidSchema } from "@/lib/validations/billing";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("receipts.void");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await context.params;

  const parsed = await parseOptionalBody(request, receiptVoidSchema);
  if ("error" in parsed) return parsed.error;
  const reason = parsed.data.reason?.trim() || "ביטול קבלה ע\"י ADMIN";

  const invoice = await prisma.cardcomInvoice.findUnique({ where: { id } });
  if (!invoice) {
    return NextResponse.json({ message: "קבלה לא נמצאה" }, { status: 404 });
  }
  // SECURITY: admin void only operates on ADMIN-tenant invoices (MyTipul's own
  // subscription receipts). USER-tenant invoices belong to therapists' clients
  // (PHI). Pattern: 403 + logger.warn (consistent with cardcom/refund:76-89).
  if (invoice.tenant !== "ADMIN") {
    logger.warn("[admin/receipts/void] blocked non-ADMIN tenant void", {
      invoiceId: id,
      invoiceTenant: invoice.tenant,
      adminUserId: session.user.id,
    });
    return NextResponse.json(
      { message: "פעולה זו זמינה רק לקבלות מערכת" },
      { status: 403 }
    );
  }
  if (invoice.status === "VOIDED") {
    return NextResponse.json({ message: "הקבלה כבר בוטלה" }, { status: 409 });
  }

  try {
    // Cardcom HTTP outside withAudit (timeout race) — see admin/create-payment-page.
    const config = await getAdminCardcomConfig();
    const voidResult = await voidCardcomDocument(
      config,
      invoice.cardcomDocumentNumber,
      reason
    );
    if (!voidResult.success) {
      throw new Error(voidResult.error ?? "Cardcom void failed");
    }

    const result = await withAudit(
      { kind: "user", session },
      {
        action: "void_cardcom_invoice",
        targetType: "cardcom_invoice",
        targetId: invoice.id,
        details: {
          documentNumber: invoice.cardcomDocumentNumber,
          amount: Number(invoice.amount),
          reason,
          refundDocumentNumber: voidResult.refundDocumentNumber,
        },
      },
      async (tx) => {
        await tx.cardcomInvoice.update({
          where: { id: invoice.id },
          data: {
            status: "VOIDED",
            voidedAt: new Date(),
            voidReason: reason,
          },
        });
        return { success: true, refundDocumentNumber: voidResult.refundDocumentNumber };
      }
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[admin/receipts/void] failed", { invoiceId: id, error: message });
    return NextResponse.json({ message: `ביטול הקבלה נכשל: ${message}` }, { status: 502 });
  }
}
