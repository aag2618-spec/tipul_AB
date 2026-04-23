import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("payments.manual");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { amount, description, status, paidAt, invoiceUrl } = body;

    const existingPayment = await prisma.subscriptionPayment.findUnique({
      where: { id },
    });

    if (!existingPayment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined) updateData.amount = amount;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (invoiceUrl !== undefined) updateData.invoiceUrl = invoiceUrl;
    if (paidAt !== undefined) updateData.paidAt = paidAt ? new Date(paidAt) : null;

    // Auto-set paidAt when status changes to PAID
    if (status === "PAID" && !existingPayment.paidAt && !paidAt) {
      updateData.paidAt = new Date();
    }

    const payment = await withAudit(
      { kind: "user", session },
      {
        action: "update_payment",
        targetType: "payment",
        targetId: id,
        details: {
          patch: updateData,
          previousStatus: existingPayment.status,
          previousAmount: Number(existingPayment.amount) || 0,
        },
      },
      async (tx) =>
        tx.subscriptionPayment.update({
          where: { id },
          data: updateData,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })
    );

    return NextResponse.json(serializePrisma(payment));
  } catch (error) {
    logger.error("Update payment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // payments.delete — hard-delete של רשומה פיננסית, ADMIN בלבד.
    // (שם הרשאה נפרד מ-payments.refund — refund היא פעולה אחרת שעוד לא מומשה).
    const auth = await requirePermission("payments.delete");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const payment = await prisma.subscriptionPayment.findUnique({
      where: { id },
    });

    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_payment",
        targetType: "payment",
        targetId: id,
        details: {
          userId: payment.userId,
          amount: Number(payment.amount) || 0,
          status: payment.status,
          description: payment.description,
        },
      },
      async (tx) => {
        await tx.subscriptionPayment.delete({
          where: { id },
        });
      }
    );

    return NextResponse.json({ message: "התשלום נמחק בהצלחה" });
  } catch (error) {
    logger.error("Delete payment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת התשלום" },
      { status: 500 }
    );
  }
}
