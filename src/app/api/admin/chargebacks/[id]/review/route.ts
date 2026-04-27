// src/app/api/admin/chargebacks/[id]/review/route.ts
// POST — mark a ChargebackEvent as reviewed by an admin (with optional note),
// and optionally flag it as reconciled (we issued the local refund/void).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface ReviewBody {
  note?: string;
  reconciled?: boolean;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Next.js 15+/16 — params is async and must be awaited before use.
  const { id } = await context.params;

  // Reconciliation is a finance-impact change → require the same rank as refunds.
  const auth = await requirePermission("payments.refund");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let body: ReviewBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  if (body.note !== undefined && typeof body.note !== "string") {
    return NextResponse.json({ message: "הערה חייבת להיות מחרוזת" }, { status: 400 });
  }
  if (body.note && body.note.length > 2000) {
    return NextResponse.json({ message: "הערה ארוכה מדי (מקסימום 2000 תווים)" }, { status: 400 });
  }
  if (body.reconciled !== undefined && typeof body.reconciled !== "boolean") {
    return NextResponse.json({ message: "reconciled חייב להיות boolean" }, { status: 400 });
  }

  // Sanitize the free-form note before persistence to short-circuit XSS in
  // any future UI that renders the text without escaping. We:
  //  1. Strip control characters (except \n / \t) — would break log JSON.
  //  2. Replace `<` and `>` with their entity equivalents so the note can be
  //     dropped into HTML safely even by buggy code.
  if (body.note) {
    body.note = body.note
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  try {
    // The read+update+log run inside a single Serializable tx — otherwise the
    // `previous` snapshot in the audit details could be stale (another admin
    // might have flipped reconciled between our findUnique and update).
    let notFound = false;
    const result = await withAudit(
      { kind: "user", session },
      {
        action: "chargeback_review",
        targetType: "chargeback_event",
        targetId: id,
        // `details` evaluated lazily by withAudit only after the callback
        // succeeds; we capture `previous`/`updates` from inside the tx via
        // a closure variable.
        details: {},
      },
      async (tx) => {
        const existing = await tx.chargebackEvent.findUnique({
          where: { id: id },
          select: { id: true, reviewedAt: true, reviewNote: true, reconciled: true, tenant: true },
        });
        if (!existing) {
          notFound = true;
          return null;
        }

        const updated = await tx.chargebackEvent.update({
          where: { id: id },
          data: {
            reviewedAt: new Date(),
            ...(body.note !== undefined ? { reviewNote: body.note || null } : {}),
            ...(body.reconciled !== undefined ? { reconciled: body.reconciled } : {}),
          },
          select: {
            id: true,
            reviewedAt: true,
            reviewNote: true,
            reconciled: true,
          },
        });

        // Log a follow-up audit row WITH the snapshot now that the update
        // is committed within the same tx (the outer withAudit row is the
        // canonical action; this just attaches the before/after).
        // `details` is `String? @db.Text` in the schema → JSON.stringify.
        await tx.adminAuditLog.create({
          data: {
            adminId: session.user.id,
            adminEmail: session.user.email ?? null,
            adminName: session.user.name ?? null,
            action: "chargeback_review_snapshot",
            targetType: "chargeback_event",
            targetId: id,
            details: JSON.stringify({
              previous: {
                reviewedAt: existing.reviewedAt?.toISOString() ?? null,
                reviewNote: existing.reviewNote,
                reconciled: existing.reconciled,
              },
              after: {
                reviewedAt: updated.reviewedAt?.toISOString() ?? null,
                reviewNote: updated.reviewNote,
                reconciled: updated.reconciled,
              },
            }),
          },
        });

        return updated;
      }
    );

    if (notFound || !result) {
      return NextResponse.json({ message: "החזרת חיוב לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json({
      id: result.id,
      reviewedAt: result.reviewedAt?.toISOString() ?? null,
      reviewNote: result.reviewNote,
      reconciled: result.reconciled,
    });
  } catch (err) {
    logger.error("[admin/chargebacks/review] failed", {
      chargebackId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון החזרת החיוב" },
      { status: 500 }
    );
  }
}
