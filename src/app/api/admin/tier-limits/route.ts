import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

// ברירות מחדל למכסות לפי תוכנית
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
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

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
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await req.json();
    const { tier, ...updateData } = body;

    if (!tier) {
      return NextResponse.json(
        { message: "חסר שדה תוכנית" },
        { status: 400 }
      );
    }

    const updatedLimit = await prisma.tierLimits.upsert({
      where: { tier },
      update: updateData,
      create: {
        tier,
        ...DEFAULT_LIMITS[tier as keyof typeof DEFAULT_LIMITS],
        ...updateData,
      },
    });

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

// POST - אתחול המכסות לברירות מחדל
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // Reset all to defaults
    await prisma.tierLimits.deleteMany({});
    
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

    const limits = await prisma.tierLimits.findMany({
      orderBy: { priceMonthly: "asc" },
    });

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
