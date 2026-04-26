import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

// ברירות מחדל למכסות לפי תוכנית.
//
// ⚠️ Drift warning (Stage 1.17.4): המספרים הללו משוכפלים ב-
// `src/lib/usage-limits.ts` (שם `DEFAULT_LIMITS` בלי metadata). כל שינוי כאן
// חייב להיות מסונכרן גם שם. רefactor עתידי: לאחד ב-`src/lib/defaults.ts`.
const DEFAULT_LIMITS = {
  ESSENTIAL: {
    displayNameHe: "בסיסי",
    displayNameEn: "Essential",
    priceMonthly: 117,
    description: "ניהול פרקטיקה בסיסי ללא תכונות AI",
    sessionPrepLimit: -1,           // חסום
    conciseAnalysisLimit: -1,       // חסום
    detailedAnalysisLimit: -1,      // חסום
    singleQuestionnaireLimit: -1,   // חסום
    combinedQuestionnaireLimit: -1, // חסום
    progressReportLimit: -1,        // חסום
  },
  PRO: {
    displayNameHe: "מקצועי",
    displayNameEn: "Professional",
    priceMonthly: 145,
    description: "AI תמציתי לניתוחים והכנות לפגישות",
    sessionPrepLimit: 200,          // 200 הכנות לחודש
    conciseAnalysisLimit: 100,      // 100 ניתוחים תמציתיים
    detailedAnalysisLimit: -1,      // חסום (רק Enterprise)
    singleQuestionnaireLimit: 60,   // 60 ניתוחי שאלון בודד
    combinedQuestionnaireLimit: 30, // 30 ניתוחים משולבים
    progressReportLimit: 15,        // 15 דוחות התקדמות
  },
  ENTERPRISE: {
    displayNameHe: "ארגוני",
    displayNameEn: "Enterprise",
    priceMonthly: 220,
    description: "AI מפורט עם גישות טיפוליות ספציפיות",
    sessionPrepLimit: 400,          // 400 הכנות לחודש
    conciseAnalysisLimit: 150,      // 150 ניתוחים תמציתיים
    detailedAnalysisLimit: 50,      // 50 ניתוחים מפורטים
    singleQuestionnaireLimit: 80,   // 80 ניתוחי שאלון בודד
    combinedQuestionnaireLimit: 40, // 40 ניתוחים משולבים
    progressReportLimit: 20,        // 20 דוחות התקדמות
  },
};

// GET - קבלת מכסות לפי תוכנית
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    // Try to get from DB, fallback to defaults
    let limits = await prisma.tierLimits.findMany({
      orderBy: { priceMonthly: "asc" },
    });

    // If no limits in DB, seed with defaults
    if (limits.length === 0) {
      await Promise.all(
        Object.entries(DEFAULT_LIMITS).map(([tier, data]) =>
          prisma.tierLimits.create({
            data: {
              tier: tier as "ESSENTIAL" | "PRO" | "ENTERPRISE",
              ...data,
            },
          })
        )
      );
      
      limits = await prisma.tierLimits.findMany({
        orderBy: { priceMonthly: "asc" },
      });
    }

    return NextResponse.json({ limits, defaults: DEFAULT_LIMITS });
  } catch (error) {
    logger.error("Tier limits GET error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת המכסות" },
      { status: 500 }
    );
  }
}

// PUT - עדכון מכסות לתוכנית
export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const { tier, ...updateData } = body;

    if (!tier) {
      return NextResponse.json(
        { message: "חסר שדה תוכנית" },
        { status: 400 }
      );
    }

    const previous = await prisma.tierLimits.findUnique({ where: { tier } });

    const updatedLimit = await withAudit(
      { kind: "user", session },
      {
        action: "update_tier_limits",
        targetType: "tier_limits",
        targetId: tier,
        details: {
          tier,
          patch: updateData,
          previousValues: previous
            ? {
                priceMonthly: Number(previous.priceMonthly) || 0,
                sessionPrepLimit: previous.sessionPrepLimit,
                conciseAnalysisLimit: previous.conciseAnalysisLimit,
                detailedAnalysisLimit: previous.detailedAnalysisLimit,
              }
            : null,
        },
      },
      async (tx) =>
        tx.tierLimits.upsert({
          where: { tier },
          update: updateData,
          create: {
            tier,
            ...DEFAULT_LIMITS[tier as keyof typeof DEFAULT_LIMITS],
            ...updateData,
          },
        })
    );

    return NextResponse.json({
      success: true,
      limit: updatedLimit,
      message: "המכסות עודכנו בהצלחה",
    });
  } catch (error) {
    logger.error("Tier limits PUT error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון המכסות" },
      { status: 500 }
    );
  }
}

// POST - אתחול המכסות לברירות מחדל (פעולה הרסנית!)
const RESET_CONFIRM_TOKEN = "RESET_TIER_LIMITS";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    // Double-confirm: ה-UI חייב לשלוח confirm מפורש — מונע click בטעות.
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== RESET_CONFIRM_TOKEN) {
      return NextResponse.json(
        {
          message:
            "פעולה הרסנית: יש לשלוח confirm=\"RESET_TIER_LIMITS\" בגוף הבקשה כדי לאשר איפוס מלא של כל המכסות.",
        },
        { status: 400 }
      );
    }

    // שומר snapshot לפני ה-reset — כדי ש-audit יוכל לשחזר אם צריך.
    const previousLimits = await prisma.tierLimits.findMany({
      orderBy: { priceMonthly: "asc" },
    });

    const limits = await withAudit(
      { kind: "user", session },
      {
        action: "reset_all_tier_limits",
        targetType: "tier_limits",
        details: {
          previousLimitsSnapshot: previousLimits.map((l) => ({
            tier: l.tier,
            priceMonthly: Number(l.priceMonthly) || 0,
            sessionPrepLimit: l.sessionPrepLimit,
            conciseAnalysisLimit: l.conciseAnalysisLimit,
            detailedAnalysisLimit: l.detailedAnalysisLimit,
            singleQuestionnaireLimit: l.singleQuestionnaireLimit,
            combinedQuestionnaireLimit: l.combinedQuestionnaireLimit,
            progressReportLimit: l.progressReportLimit,
          })),
        },
      },
      async (tx) => {
        await tx.tierLimits.deleteMany({});
        for (const [tier, data] of Object.entries(DEFAULT_LIMITS)) {
          await tx.tierLimits.create({
            data: {
              tier: tier as "ESSENTIAL" | "PRO" | "ENTERPRISE",
              ...data,
            },
          });
        }
        return tx.tierLimits.findMany({ orderBy: { priceMonthly: "asc" } });
      }
    );

    return NextResponse.json({
      success: true,
      limits,
      message: "המכסות אותחלו לברירות מחדל",
    });
  } catch (error) {
    logger.error("Tier limits POST error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה באתחול המכסות" },
      { status: 500 }
    );
  }
}
