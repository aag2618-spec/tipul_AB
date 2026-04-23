import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

// GET - קבלת התראה ספציפית
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.view");
    if ("error" in auth) return auth.error;

    const { id } = await params;
    
    const alert = await prisma.adminAlert.findUnique({
      where: { id },
    });

    if (!alert) {
      return NextResponse.json({ message: "התראה לא נמצאה" }, { status: 404 });
    }

    // Get related user if exists
    let relatedUser = null;
    if (alert.userId) {
      relatedUser = await prisma.user.findUnique({
        where: { id: alert.userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          aiTier: true,
          subscriptionStatus: true,
        },
      });
    }

    return NextResponse.json({ alert, relatedUser });
  } catch (error) {
    logger.error("Admin alert GET error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההתראה" },
      { status: 500 }
    );
  }
}

// PATCH - עדכון התראה
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("alerts.manage");
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await req.json();

    const {
      status,
      priority,
      actionTaken,
      scheduledFor,
    } = body;

    const updateData: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;
      if (status === "RESOLVED") {
        updateData.resolvedAt = new Date();
        updateData.resolvedBy = userId;
      }
    }
    if (priority) updateData.priority = priority;
    if (actionTaken) updateData.actionTaken = actionTaken;
    if (scheduledFor) updateData.scheduledFor = new Date(scheduledFor);

    const alert = await withAudit(
      { kind: "user", session },
      {
        action: status ? `alert_status_${String(status).toLowerCase()}` : "alert_update",
        targetType: "admin_alert",
        targetId: id,
        details: {
          statusChange: status ?? undefined,
          priorityChange: priority ?? undefined,
          actionTakenChanged: actionTaken !== undefined,
        },
      },
      async (tx) =>
        tx.adminAlert.update({
          where: { id },
          data: updateData,
        })
    );

    return NextResponse.json({
      success: true,
      alert,
      message: "התראה עודכנה בהצלחה",
    });
  } catch (error) {
    logger.error("Admin alert PATCH error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון ההתראה" },
      { status: 500 }
    );
  }
}

// DELETE - מחיקת התראה
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("alerts.manage");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const existing = await prisma.adminAlert.findUnique({
      where: { id },
      select: { id: true, type: true, priority: true, title: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ message: "התראה לא נמצאה" }, { status: 404 });
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_alert",
        targetType: "admin_alert",
        targetId: id,
        details: {
          type: existing.type,
          priority: existing.priority,
          title: existing.title,
          status: existing.status,
        },
      },
      async (tx) => {
        await tx.adminAlert.delete({ where: { id } });
      }
    );

    return NextResponse.json({
      success: true,
      message: "התראה נמחקה בהצלחה",
    });
  } catch (error) {
    logger.error("Admin alert DELETE error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה במחיקת ההתראה" },
      { status: 500 }
    );
  }
}
