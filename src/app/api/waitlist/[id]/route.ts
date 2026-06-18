import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { isSecretary, loadScopeUser, secretaryCan } from "@/lib/scope";
import { waitlistScope } from "@/lib/waitlist-scope";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const TIME_RE = /^\d{1,2}:\d{2}$/;

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PLACED", "CANCELLED"]).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  preferredTimeFrom: z.string().regex(TIME_RE).nullable().optional(),
  preferredTimeTo: z.string().regex(TIME_RE).nullable().optional(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  note: z.string().max(500).nullable().optional(),
  placedSessionId: z.string().min(1).nullable().optional(),
});

/** מוודא שהרשומה קיימת ובתוך ה-scope של המשתמש (בידוד tenant). */
async function findInScope(id: string, userId: string) {
  const scopeUser = await loadScopeUser(userId);
  const entry = await prisma.waitlistEntry.findFirst({
    where: { AND: [{ id }, waitlistScope(scopeUser, userId)] },
    select: { id: true },
  });
  return { scopeUser, entry };
}

// PATCH /api/waitlist/[id] — עדכון רשומה (סטטוס/העדפות).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const { scopeUser, entry } = await findInScope(id, userId);
    if (!entry) {
      return NextResponse.json({ message: "הרשומה לא נמצאה" }, { status: 404 });
    }
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה לנהל את רשימת ההמתנה" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "נתונים לא תקינים", errors: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const updated = await prisma.waitlistEntry.update({
      where: { id },
      data: {
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.durationMinutes !== undefined
          ? { durationMinutes: d.durationMinutes }
          : {}),
        ...(d.preferredDays !== undefined
          ? {
              preferredDays:
                d.preferredDays && d.preferredDays.length > 0
                  ? d.preferredDays
                  : undefined,
            }
          : {}),
        ...(d.preferredTimeFrom !== undefined
          ? { preferredTimeFrom: d.preferredTimeFrom }
          : {}),
        ...(d.preferredTimeTo !== undefined
          ? { preferredTimeTo: d.preferredTimeTo }
          : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
        ...(d.placedSessionId !== undefined
          ? { placedSessionId: d.placedSessionId }
          : {}),
      },
      include: {
        client: { select: { id: true, name: true, phone: true } },
      },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error("waitlist PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון רשומת ההמתנה" },
      { status: 500 },
    );
  }
}

// DELETE /api/waitlist/[id] — הסרה מרשימת ההמתנה.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const { scopeUser, entry } = await findInScope(id, userId);
    if (!entry) {
      return NextResponse.json({ message: "הרשומה לא נמצאה" }, { status: 404 });
    }
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה לנהל את רשימת ההמתנה" },
        { status: 403 },
      );
    }

    await prisma.waitlistEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("waitlist DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהסרה מרשימת ההמתנה" },
      { status: 500 },
    );
  }
}
