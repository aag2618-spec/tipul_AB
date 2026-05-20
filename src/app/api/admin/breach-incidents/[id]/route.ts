// R5 (סבב 17e) — עדכון אירוע אבטחה ספציפי.
// ADMIN בלבד. ה-PATCH מאפשר לעדכן status, resolution, ותאריכי הודעה (לרשם
// וללקוחות). אין DELETE — רשומות אירוע אבטחה אינן ניתנות למחיקה.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";

export const dynamic = "force-dynamic";

const BreachStatusEnum = z.enum([
  "OPEN",
  "INVESTIGATING",
  "CONTAINED",
  "RESOLVED",
  "FALSE_ALARM",
]);

const updateBreachSchema = z
  .object({
    status: BreachStatusEnum.optional(),
    notifiedRegistrarAt: z.string().datetime().nullable().optional(),
    notifiedClientsAt: z.string().datetime().nullable().optional(),
    resolution: z.string().max(10_000).nullable().optional(),
    resolvedAt: z.string().datetime().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "נדרש שדה אחד לפחות לעדכון",
  });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await context.params;

    const parsed = await parseBody(request, updateBreachSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    const existing = await prisma.breachIncident.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { message: "אירוע אבטחה לא נמצא" },
        { status: 404 }
      );
    }

    // אוטומציה: סטטוס=RESOLVED → resolvedAt=now אם לא סופק.
    const resolvedAtAuto =
      body.status === "RESOLVED" && body.resolvedAt === undefined
        ? new Date()
        : undefined;

    const updated = await withAudit(
      { kind: "user", session },
      {
        action: "update_breach_incident",
        targetType: "breach_incident",
        targetId: id,
        details: {
          fields: Object.keys(body),
          newStatus: body.status,
        },
      },
      async (tx) =>
        tx.breachIncident.update({
          where: { id },
          data: {
            ...(body.status !== undefined && { status: body.status }),
            ...(body.notifiedRegistrarAt !== undefined && {
              notifiedRegistrarAt: body.notifiedRegistrarAt
                ? new Date(body.notifiedRegistrarAt)
                : null,
            }),
            ...(body.notifiedClientsAt !== undefined && {
              notifiedClientsAt: body.notifiedClientsAt
                ? new Date(body.notifiedClientsAt)
                : null,
            }),
            ...(body.resolution !== undefined && { resolution: body.resolution }),
            ...(body.resolvedAt !== undefined && {
              resolvedAt: body.resolvedAt ? new Date(body.resolvedAt) : null,
            }),
            ...(resolvedAtAuto && { resolvedAt: resolvedAtAuto }),
          },
        })
    );

    return NextResponse.json({ incident: updated });
  } catch (err) {
    logger.error("[admin/breach-incidents/:id] PATCH failed", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון אירוע האבטחה" },
      { status: 500 }
    );
  }
}
