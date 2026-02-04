import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - קבלת התראה ספציפית
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

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
    console.error("Admin alert GET error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

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
        updateData.resolvedBy = session.user.id;
      }
    }
    if (priority) updateData.priority = priority;
    if (actionTaken) updateData.actionTaken = actionTaken;
    if (scheduledFor) updateData.scheduledFor = new Date(scheduledFor);

    const alert = await prisma.adminAlert.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      alert,
      message: "התראה עודכנה בהצלחה",
    });
  } catch (error) {
    console.error("Admin alert PATCH error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const { id } = await params;

    await prisma.adminAlert.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "התראה נמחקה בהצלחה",
    });
  } catch (error) {
    console.error("Admin alert DELETE error:", error);
    return NextResponse.json(
      { message: "שגיאה במחיקת ההתראה" },
      { status: 500 }
    );
  }
}
