import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// ============================================================================
// PATCH — עדכון notes / validUntil בלבד (immutability לכל יתר השדות).
// אם רוצים לשנות מחיר — יוצרים policy חדש עם validFrom מאוחר יותר.
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    if (session.user.actingAs) {
      return NextResponse.json(
        { message: "אסור לשנות תמחור במצב התחזות" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const existing = await prisma.pricingPolicy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { message: "מדיניות התמחור לא נמצאה" },
        { status: 404 }
      );
    }

    const fieldNames: Record<string, string> = {
      scope: "היקף",
      organizationId: "קליניקה",
      userId: "משתמש",
      planTier: "רמת תוכנית",
      monthlyIls: "מחיר חודשי",
      quarterlyIls: "מחיר רבעוני",
      halfYearIls: "מחיר חצי-שנתי",
      yearlyIls: "מחיר שנתי",
      validFrom: "תאריך התחלה",
    };
    for (const key of Object.keys(fieldNames)) {
      if (key in body && body[key] !== undefined) {
        return NextResponse.json(
          {
            message: `אסור לשנות ${fieldNames[key]} במדיניות קיימת. ניתן ליצור מדיניות חדשה עם תאריך התחלה מאוחר יותר.`,
          },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if ("notes" in body) {
      updateData.notes = typeof body.notes === "string" ? body.notes : null;
    }
    if ("validUntil" in body) {
      if (body.validUntil === null) {
        updateData.validUntil = null;
      } else {
        const newUntil = new Date(body.validUntil as string);
        if (Number.isNaN(newUntil.getTime())) {
          return NextResponse.json(
            { message: "תאריך סיום לא חוקי" },
            { status: 400 }
          );
        }
        if (newUntil.getTime() <= existing.validFrom.getTime()) {
          return NextResponse.json(
            { message: "תאריך סיום חייב להיות אחרי תאריך התחלה" },
            { status: 400 }
          );
        }
        // הגנת חוקיות חיובים: לא לאפשר לסיים בעבר policy שכבר חל,
        // כדי שלא ייצר drift בין אודיט החיובים לתמחור הרשום.
        // אם המדיניות עוד לא נכנסה לתוקף — מותר.
        const now = Date.now();
        if (existing.validFrom.getTime() <= now && newUntil.getTime() < now) {
          return NextResponse.json(
            {
              message:
                "אסור להגדיר תאריך סיום בעבר עבור מדיניות שכבר פעילה. ניתן לסיים אותה רק החל ממועד נוכחי או עתידי.",
            },
            { status: 400 }
          );
        }
        updateData.validUntil = newUntil;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "אין שדות לעדכון" }, { status: 400 });
    }

    const updated = await withAudit(
      { kind: "user", session },
      {
        action: "update_pricing_policy",
        targetType: "PricingPolicy",
        targetId: id,
        details: { changes: Object.keys(updateData) },
      },
      (tx) => tx.pricingPolicy.update({ where: { id }, data: updateData })
    );

    const serialized = {
      ...updated,
      monthlyIls: Number(updated.monthlyIls),
      quarterlyIls: updated.quarterlyIls === null ? null : Number(updated.quarterlyIls),
      halfYearIls: updated.halfYearIls === null ? null : Number(updated.halfYearIls),
      yearlyIls: updated.yearlyIls === null ? null : Number(updated.yearlyIls),
    };

    return NextResponse.json(JSON.parse(JSON.stringify(serialized)));
  } catch (error) {
    logger.error("[admin/pricing/policies/[id]] PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון מדיניות התמחור" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE — מחיקה רק אם validFrom > now (policy שעדיין לא חל)
//           או אם validUntil <= now (policy שכבר פג, ניתן לנקות).
// אחרת — יש לעדכן validUntil כדי לסיים את התוקף בלי לפגוע באודיט.
// ============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    if (session.user.actingAs) {
      return NextResponse.json(
        { message: "אסור למחוק תמחור במצב התחזות" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await prisma.pricingPolicy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { message: "מדיניות התמחור לא נמצאה" },
        { status: 404 }
      );
    }

    const now = Date.now();
    const isFuture = existing.validFrom.getTime() > now;
    const isExpired =
      existing.validUntil !== null && existing.validUntil.getTime() <= now;

    if (!isFuture && !isExpired) {
      return NextResponse.json(
        {
          message:
            "אסור למחוק מדיניות פעילה. במקום זה — עדכן/י תאריך סיום למועד נוכחי כדי לסיים אותה.",
        },
        { status: 400 }
      );
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_pricing_policy",
        targetType: "PricingPolicy",
        targetId: id,
        details: { scope: existing.scope, planTier: existing.planTier },
      },
      (tx) => tx.pricingPolicy.delete({ where: { id } })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[admin/pricing/policies/[id]] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת מדיניות התמחור" },
      { status: 500 }
    );
  }
}
