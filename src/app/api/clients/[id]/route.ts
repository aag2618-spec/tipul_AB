import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { logDataAccess } from "@/lib/audit-logger";
import {
  buildClientWhere,
  getClientSafeSelectForSecretary,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

// Stage 2.0 — Zod schema לעדכון מטופל. כל השדות אופציונליים (PATCH semantics).
// .passthrough() נשמר במכוון כדי שבדיקת השדות הקליניים החסומים למזכירה
// (CLINICAL_KEYS_BLOCKED) תוכל לקרוא את ה-body המקורי. השדות הקליניים האלה
// **אינם** ב-schema, אז גם אם הם passthrough — ה-destructuring למטה לא קולט
// אותם, והם לא מגיעים ל-Prisma update.data. אם תוסיפו שדות חדשים ל-Zod,
// כיסו גם אותם ב-CLINICAL_KEYS_BLOCKED אם רגישים קלינית.
// המגבלות:
//   - אורך מקסימום על שדות טקסט (DoS guard)
//   - email תקין (אם נשלח)
//   - phone — תווי טלפון בלבד
//   - birthDate — ISO date string (refine בודק תקינות) או null
//   - status — enum מותר (תואם Prisma ClientStatus)
//   - defaultSessionPrice — מספר חיובי או null
const UpdateClientSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  // phone — מקבל ספרות + תווי הפרדה רגילים + נקודה + פסיק + סלאש (ext, country
  // codes נוסחה בינלאומית). הרגישות העיקרית היא DoS דרך אורך — לא הצמדה לפורמט.
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(254).email("מייל לא תקין").optional().nullable().or(z.literal("")),
  birthDate: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "תאריך לא תקין")
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
  status: z.enum(["ACTIVE", "WAITING", "INACTIVE", "ARCHIVED"]).optional(),
  initialDiagnosis: z.string().max(20_000).optional().nullable(),
  intakeNotes: z.string().max(20_000).optional().nullable(),
  defaultSessionPrice: z.union([z.number().min(0).max(100_000), z.null()]).optional(),
  isQuickClient: z.boolean().optional(),
}).passthrough();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildClientWhere(scopeUser);

    // הגנה על תוכן קליני: מזכירה מקבלת select מצומצם בלבד (ללא sessionNote/recordings/transcription/analysis).
    const client = isSecretary(scopeUser)
      ? await prisma.client.findFirst({
          where: { AND: [{ id }, scopeWhere] },
          select: {
            ...getClientSafeSelectForSecretary(),
            therapySessions: {
              orderBy: { startTime: "desc" },
              take: 10,
              select: {
                id: true,
                startTime: true,
                endTime: true,
                status: true,
                type: true,
                price: true,
                location: true,
                clientId: true,
                therapistId: true,
                organizationId: true,
              },
            },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            documents: {
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : await prisma.client.findFirst({
          where: { AND: [{ id }, scopeWhere] },
          include: {
            therapySessions: {
              orderBy: { startTime: "desc" },
              take: 10,
              include: { sessionNote: true },
            },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            recordings: {
              orderBy: { createdAt: "desc" },
              take: 5,
              include: { transcription: { include: { analysis: true } } },
            },
            documents: {
              orderBy: { createdAt: "desc" },
            },
          },
        });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Audit log — קריאה לפרופיל מטופל כוללת notes/initialDiagnosis/intakeNotes
    logDataAccess({
      userId,
      recordType: "CLIENT_PROFILE",
      recordId: id,
      action: "READ",
      clientId: id,
      request,
    });

    return NextResponse.json(serializePrisma(client));
  } catch (error) {
    logger.error("Get client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המטופל" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
    }

    // Stage 2.0 — Zod input validation. דוחה body עם שדות לא-תקינים (סוגים, אורכים, פורמט).
    const parsed = UpdateClientSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          message: firstIssue?.message ?? "נתונים לא תקינים",
          field: firstIssue?.path.join(".") ?? null,
        },
        { status: 400 }
      );
    }

    const { firstName, lastName, phone, email, birthDate, address, notes, status, initialDiagnosis, intakeNotes, defaultSessionPrice, isQuickClient } = parsed.data;

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildClientWhere(scopeUser);

    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה לעדכון מטופל" },
        { status: 403 }
      );
    }

    // חסימת מזכירה מעדכון שדות קליניים (חוק זכויות החולה / חוק הפסיכולוגים).
    if (isSecretary(scopeUser)) {
      const CLINICAL_KEYS_BLOCKED = [
        "notes",
        "intakeNotes",
        "initialDiagnosis",
        "medicalHistory",
        "therapeuticApproaches",
        "approachNotes",
        "culturalContext",
        "comprehensiveAnalysis",
        "comprehensiveAnalysisAt",
      ];
      const sentClinicalKeys = CLINICAL_KEYS_BLOCKED.filter(
        (k) => k in body && body[k] !== undefined
      );
      if (sentClinicalKeys.length > 0) {
        logger.warn("[clients/PUT] Secretary attempted to update clinical fields", {
          userId,
          clientId: id,
          sentClinicalKeys,
        });
        return NextResponse.json(
          { message: "אין הרשאה לעדכון שדות קליניים" },
          { status: 403 }
        );
      }
    }

    // Verify ownership / scope
    const existingClient = await prisma.client.findFirst({
      where: { AND: [{ id }, scopeWhere] },
    });

    if (!existingClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    const client = await prisma.client.update({
      where: { id },
      data: {
        firstName: firstName?.trim() || existingClient.firstName || "",
        lastName: lastName?.trim() || existingClient.lastName || "",
        name: (firstName && lastName) ? `${firstName.trim()} ${lastName.trim()}` : existingClient.name,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        address: address?.trim() || null,
        notes: notes !== undefined ? (notes?.trim() || null) : existingClient.notes,
        status: status || existingClient.status,
        defaultSessionPrice: defaultSessionPrice !== undefined ? defaultSessionPrice : existingClient.defaultSessionPrice,
        initialDiagnosis: initialDiagnosis !== undefined ? (initialDiagnosis?.trim() || null) : existingClient.initialDiagnosis,
        intakeNotes: intakeNotes !== undefined ? (intakeNotes?.trim() || null) : existingClient.intakeNotes,
        // שדרוג פונה למטופל קבוע — אוטומטי אם יש firstName+lastName, או ידני
        ...(isQuickClient !== undefined
          ? { isQuickClient }
          : existingClient.isQuickClient && firstName?.trim() && lastName?.trim()
            ? { isQuickClient: false }
            : {}),
      },
    });

    return NextResponse.json(serializePrisma(client));
  } catch (error) {
    logger.error("Update client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון המטופל" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildClientWhere(scopeUser);

    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה למחיקת מטופל" },
        { status: 403 }
      );
    }

    // Verify ownership / scope
    const existingClient = await prisma.client.findFirst({
      where: { AND: [{ id }, scopeWhere] },
    });

    if (!existingClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    await prisma.client.delete({ where: { id } });

    return NextResponse.json({ message: "המטופל נמחק בהצלחה" });
  } catch (error) {
    logger.error("Delete client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המטופל" },
      { status: 500 }
    );
  }
}
