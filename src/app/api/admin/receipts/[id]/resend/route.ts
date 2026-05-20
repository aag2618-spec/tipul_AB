// src/app/api/admin/receipts/[id]/resend/route.ts
// שליחה מחדש של קבלה למייל — קורא ל-Cardcom Documents/Send.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { logAdminAction } from "@/lib/audit";
import { getAdminCardcomConfig } from "@/lib/cardcom/admin-config";
import { resendCardcomDocument } from "@/lib/cardcom/invoice-api";
import { parseOptionalBody } from "@/lib/validations/helpers";
import { receiptResendSchema } from "@/lib/validations/billing";

export const dynamic = "force-dynamic";

// Per-receipt resend cooldown — prevents spamming a customer with 30 emails.
// Stored in DB (CardcomInvoice.lastResendAt) so it works across multiple
// Node.js instances on Render.
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("receipts.resend");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await context.params;

  const parsed = await parseOptionalBody(request, receiptResendSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  const invoice = await prisma.cardcomInvoice.findUnique({ where: { id } });
  if (!invoice) {
    return NextResponse.json({ message: "קבלה לא נמצאה" }, { status: 404 });
  }
  // SECURITY: admin resend operates only on ADMIN-tenant invoices. USER-tenant
  // invoices belong to therapists' clients (PHI); admin must not trigger emails
  // to those recipients on the therapist's behalf via this endpoint. Therapists
  // resend their own client invoices through their own UI.
  // Pattern: 403 + logger.warn (consistent with cardcom/refund:76-89).
  if (invoice.tenant !== "ADMIN") {
    logger.warn("[admin/receipts/resend] blocked non-ADMIN tenant resend", {
      invoiceId: id,
      invoiceTenant: invoice.tenant,
      adminUserId: session.user.id,
    });
    return NextResponse.json(
      { message: "פעולה זו זמינה רק לקבלות מערכת" },
      { status: 403 }
    );
  }

  const targetEmail = body.email || invoice.subscriberEmailSnapshot;
  if (!targetEmail) {
    return NextResponse.json({ message: "נדרשת כתובת מייל" }, { status: 400 });
  }
  // safety-net על email שמגיע מ-DB snapshot (לא נכנס דרך zod) — אם snapshot
  // נשמר בעבר עם email פגום, נחסום לפני שליחה ל-Cardcom.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return NextResponse.json({ message: "כתובת מייל לא תקינה" }, { status: 400 });
  }

  // ATOMIC cooldown claim — DB-backed AND race-safe. updateMany only succeeds
  // if the row's lastResendAt is null OR older than the cooldown cutoff.
  // Two concurrent requests will see only one succeed; the other gets 429.
  const now = new Date();
  const cutoff = new Date(now.getTime() - RESEND_COOLDOWN_MS);
  const claimed = await prisma.cardcomInvoice.updateMany({
    where: {
      id,
      OR: [{ lastResendAt: null }, { lastResendAt: { lt: cutoff } }],
    },
    data: { lastResendAt: now, resendCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    // Compute wait by re-reading the invoice (may have moved further during the read race).
    const fresh = await prisma.cardcomInvoice.findUnique({
      where: { id },
      select: { lastResendAt: true },
    });
    const elapsed = fresh?.lastResendAt
      ? now.getTime() - fresh.lastResendAt.getTime()
      : 0;
    const wait = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
    return NextResponse.json(
      {
        message: `נא להמתין ${wait} שניות לפני שליחה חוזרת`,
        retryAfterSeconds: wait,
      },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  // Audit BEFORE the external call — captures intent even if Cardcom call fails.
  // Best-effort: a transient DB error in audit must NOT block the resend itself.
  await logAdminAction({
    adminId: session.user.id,
    action: "cardcom_invoice_resend_attempt",
    targetType: "cardcom_invoice",
    targetId: id,
    details: { documentNumber: invoice.cardcomDocumentNumber, email: targetEmail },
  }).catch((err) => {
    logger.warn("[admin/receipts/resend] audit log failed (proceeding anyway)", {
      invoiceId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  try {
    // ADMIN tenant only (enforced above) — always use the global MyTipul terminal.
    const config = await getAdminCardcomConfig();
    if (!config.apiPassword) {
      await prisma.cardcomInvoice
        .updateMany({ where: { id, lastResendAt: now }, data: { lastResendAt: null } })
        .catch(() => undefined);
      return NextResponse.json(
        { message: "ApiPassword של MyTipul לא מוגדר ב-env — לא ניתן לשלוח מחדש." },
        { status: 409 }
      );
    }
    const result = await resendCardcomDocument(
      config,
      invoice.cardcomDocumentNumber,
      targetEmail
    );
    if (!result.success) {
      // Release the cooldown so the admin can retry without waiting.
      // Release the cooldown so the admin can retry. resendCount is intentionally
      // NOT decremented — it represents *attempts*, including failed ones,
      // which is the correct count for an audit-style metric.
      await prisma.cardcomInvoice.updateMany({
        where: { id, lastResendAt: now },
        data: { lastResendAt: null },
      });
      return NextResponse.json(
        { message: result.error ?? "שליחה מחדש נכשלה" },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, email: targetEmail });
  } catch (err) {
    // Release cooldown on exception so retry is possible.
    // resendCount is intentionally NOT decremented here — same reasoning as the
    // !result.success branch above: it counts ATTEMPTS (audit-style), not
    // successes. Decrementing on exception would diverge from the success-fail
    // branch (which keeps the count) and would let a flaky network produce
    // an artificially low resendCount.
    await prisma.cardcomInvoice
      .updateMany({
        where: { id, lastResendAt: now },
        data: { lastResendAt: null },
      })
      .catch(() => undefined);
    logger.error("[admin/receipts/resend] failed", {
      invoiceId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שליחה מחדש נכשלה" }, { status: 502 });
  }
}
