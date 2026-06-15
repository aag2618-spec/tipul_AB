import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { parseBody } from "@/lib/validations/helpers";
import { createRoomSchema } from "@/lib/validations/clinic-room";

export const dynamic = "force-dynamic";

// ============================================================================
// /api/clinic/rooms — חדרי טיפול של הקליניקה (שלב 2)
// ============================================================================
// GET  — רשימת החדרים. נגיש לכל חבר/ת קליניקה (בורר חדר בקביעת פגישה + עמוד
//        הניהול). מטפל/ת עצמאי/ת (ללא organizationId) → רשימה ריקה, כך שהבורר
//        פשוט לא יוצג והשדה הטקסטואלי הקיים נשאר. אין כאן חשיפת PHI — רק שמות
//        חדרים, תחומים ל-organizationId של המשתמש/ת.
// POST — יצירת חדר. בעלים בלבד (requireClinicOwner).
// ============================================================================

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;

    const scopeUser = await loadScopeUser(auth.userId);
    // מטפל/ת עצמאי/ת — אין קליניקה, ולכן אין חדרים מנוהלים.
    if (!scopeUser.organizationId) return NextResponse.json([]);

    const rooms = await prisma.clinicRoom.findMany({
      where: { organizationId: scopeUser.organizationId },
      select: { id: true, name: true, isActive: true, sortOrder: true },
      // פעילים קודם, אחר כך לפי סדר תצוגה ואז א״ב — מתאים גם לבורר וגם לניהול.
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(rooms);
  } catch (error) {
    logger.error("[clinic/rooms] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת החדרים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const parsed = await parseBody(request, createRoomSchema);
    if ("error" in parsed) return parsed.error;
    const { name, sortOrder } = parsed.data;

    // מניעת כפילות שם (case-insensitive) באותה קליניקה — שני "חדר 1" מבלבלים
    // בבורר ובבדיקת חפיפת חדר.
    const existing = await prisma.clinicRoom.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { message: "כבר קיים חדר בשם הזה" },
        { status: 409 }
      );
    }

    const room = await prisma.clinicRoom.create({
      data: { organizationId, name, sortOrder: sortOrder ?? 0 },
      select: { id: true, name: true, isActive: true, sortOrder: true },
    });

    logger.info("[clinic/rooms] created", { organizationId, roomId: room.id });
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    logger.error("[clinic/rooms] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת החדר" },
      { status: 500 }
    );
  }
}
