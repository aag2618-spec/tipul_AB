// R5 (סבב 17e, 2026-05-20) — Breach Incident API.
//
// תקנות הגנת הפרטיות (אבטחת מידע) 2017 §11: דיווח לרשם הגנת הפרטיות תוך
// 72 שעות על אירוע אבטחה חמור. ה-API משמש את עמוד `/admin/breach-incidents`
// לתיעוד ומעקב.
//
// אבטחה:
//   • ADMIN בלבד (`requireAdmin`). פעולה רגולטורית, לא של CLINIC_OWNER.
//   • אין DELETE — רשומות אירוע אבטחה אינן ניתנות למחיקה (לפי תקנה §11).
//   • PATCH דרך `/[id]/route.ts` נפרד.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody, parseSearchParams } from "@/lib/validations/helpers";

export const dynamic = "force-dynamic";

const BreachSeverityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const BreachCategoryEnum = z.enum([
  "UNAUTHORIZED_ACCESS",
  "DATA_LEAK",
  "CREDENTIAL_COMPROMISE",
  "PHISHING",
  "SYSTEM_FAILURE",
  "PHYSICAL_LOSS",
  "THIRD_PARTY",
  "OTHER",
]);
const BreachStatusEnum = z.enum([
  "OPEN",
  "INVESTIGATING",
  "CONTAINED",
  "RESOLVED",
  "FALSE_ALARM",
]);

const createBreachSchema = z.object({
  severity: BreachSeverityEnum,
  category: BreachCategoryEnum,
  title: z.string().min(3).max(500),
  description: z.string().min(10).max(10_000),
  occurredAt: z.string().datetime().optional().nullable(),
  affectedClientIds: z.array(z.string()).max(10_000).optional().nullable(),
  affectedClientsCount: z.number().int().min(0).optional(),
});

const listBreachQuerySchema = z.object({
  status: BreachStatusEnum.optional(),
  severity: BreachSeverityEnum.optional(),
  category: BreachCategoryEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/admin/breach-incidents — רשימת אירועי אבטחה לדשבורד admin. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const parsed = parseSearchParams(request.url, listBreachQuerySchema);
    if ("error" in parsed) return parsed.error;
    const { status, severity, category } = parsed.data;
    // zod default → ערך תמיד יש, אבל ה-inferred type אופציונלי. ?? fallback.
    const page = parsed.data.page ?? 1;
    const size = parsed.data.size ?? 50;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (category) where.category = category;

    const [total, items] = await Promise.all([
      prisma.breachIncident.count({ where }),
      prisma.breachIncident.findMany({
        where,
        orderBy: [{ detectedAt: "desc" }],
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    return NextResponse.json({
      items,
      pagination: { page, size, total, totalPages: Math.ceil(total / size) },
    });
  } catch (err) {
    logger.error("[admin/breach-incidents] GET failed", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת אירועי האבטחה" },
      { status: 500 }
    );
  }
}

/** POST /api/admin/breach-incidents — תיעוד אירוע חדש. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const parsed = await parseBody(request, createBreachSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;

    const reporterName = session.user.name ?? session.user.email ?? userId;

    // withAudit: יצירת אירוע אבטחה חייבת להירשם ב-AdminAuditLog לעקיבות.
    const created = await withAudit(
      { kind: "user", session },
      {
        action: "create_breach_incident",
        targetType: "breach_incident",
        details: {
          severity: data.severity,
          category: data.category,
          affectedClientsCount:
            data.affectedClientsCount ?? data.affectedClientIds?.length ?? 0,
        },
      },
      async (tx) =>
        tx.breachIncident.create({
          data: {
            severity: data.severity,
            category: data.category,
            title: data.title,
            description: data.description,
            occurredAt: data.occurredAt ? new Date(data.occurredAt) : null,
            affectedClientIds: data.affectedClientIds ?? undefined,
            affectedClientsCount:
              data.affectedClientsCount ??
              data.affectedClientIds?.length ??
              0,
            reportedById: userId,
            reportedByNameSnapshot: reporterName,
          },
        })
    );

    logger.warn("[admin/breach-incidents] new incident reported", {
      incidentId: created.id,
      severity: created.severity,
      category: created.category,
      reportedById: userId,
    });

    return NextResponse.json({ incident: created }, { status: 201 });
  } catch (err) {
    logger.error("[admin/breach-incidents] POST failed", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת אירוע אבטחה" },
      { status: 500 }
    );
  }
}
