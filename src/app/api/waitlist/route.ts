import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import {
  buildClientWhere,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";
import { waitlistScope } from "@/lib/waitlist-scope";
import { shouldScopePersonal } from "@/lib/view-scope";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const TIME_RE = /^\d{1,2}:\d{2}$/;

const createSchema = z.object({
  clientId: z.string().min(1),
  preferredTherapistId: z.string().min(1).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(50),
  // ימים מועדפים 0..6 (0=ראשון). ריק/חסר = כל יום.
  preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
  preferredTimeFrom: z.string().regex(TIME_RE).optional(),
  preferredTimeTo: z.string().regex(TIME_RE).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  // אדמיניסטרטיבי בלבד — אזהרה ב-UI לא לכתוב תוכן טיפולי.
  note: z.string().max(500).optional(),
});

// GET /api/waitlist — רשימת ההמתנה הפעילה (scoped).
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    // תצוגת "שלי / כל הקליניקה" — בדיוק כמו ביומן: בעלים-שהוא-מטפל ב"שלי" רואה רק
    // את הממתינים שלו. מסנן תצוגה בלבד (לא משפיע על מחיקה/עדכון/התאמה).
    const personalOnly = await shouldScopePersonal(scopeUser);
    const entries = await prisma.waitlistEntry.findMany({
      where: {
        AND: [{ status: "ACTIVE" }, waitlistScope(scopeUser, userId, { personalOnly })],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: {
        client: { select: { id: true, name: true, phone: true } },
      },
    });

    return NextResponse.json(serializePrisma(entries));
  } catch (error) {
    logger.error("waitlist GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת רשימת ההמתנה" },
      { status: 500 },
    );
  }
}

// POST /api/waitlist — הוספת מטופל לרשימת ההמתנה.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);

    // הרשאה: מזכירה צריכה canCreateClient (פעולה אדמיניסטרטיבית-זימון).
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה לנהל את רשימת ההמתנה" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "נתונים לא תקינים", errors: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // בידוד: המטופל חייב להיות ב-scope של המשתמש.
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: data.clientId }, buildClientWhere(scopeUser)] },
      select: { id: true, therapistId: true },
    });
    if (!client) {
      return NextResponse.json({ message: "המטופל לא נמצא" }, { status: 404 });
    }

    // בידוד: אם נבחר מטפל מועדף — חייב להיות באותו ארגון (או המשתמש עצמו בעצמאי).
    if (data.preferredTherapistId) {
      if (scopeUser.organizationId) {
        const therapist = await prisma.user.findFirst({
          where: {
            id: data.preferredTherapistId,
            organizationId: scopeUser.organizationId,
            clinicRole: { in: ["THERAPIST", "OWNER"] },
          },
          select: { id: true },
        });
        if (!therapist) {
          return NextResponse.json(
            { message: "המטפל שנבחר אינו תקין" },
            { status: 400 },
          );
        }
      } else if (data.preferredTherapistId !== userId) {
        return NextResponse.json(
          { message: "המטפל שנבחר אינו תקין" },
          { status: 400 },
        );
      }
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        clientId: client.id,
        therapistId: data.preferredTherapistId || client.therapistId || userId,
        organizationId: scopeUser.organizationId,
        preferredTherapistId: data.preferredTherapistId || null,
        durationMinutes: data.durationMinutes,
        preferredDays:
          data.preferredDays && data.preferredDays.length > 0
            ? data.preferredDays
            : undefined,
        preferredTimeFrom: data.preferredTimeFrom || null,
        preferredTimeTo: data.preferredTimeTo || null,
        priority: data.priority,
        note: data.note || null,
      },
      include: {
        client: { select: { id: true, name: true, phone: true } },
      },
    });

    return NextResponse.json(serializePrisma(entry), { status: 201 });
  } catch (error) {
    logger.error("waitlist POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהוספה לרשימת ההמתנה" },
      { status: 500 },
    );
  }
}
