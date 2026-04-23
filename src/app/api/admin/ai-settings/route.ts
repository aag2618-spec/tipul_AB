import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const GLOBAL_SETTINGS_ID = "default";

// Allowlist נגד mass-assignment (Cursor M3). רק השדות האלה מותרים לעדכון.
// id/updatedAt נשלטים על ידי Prisma והשרת בלבד.
const ALLOWED_FIELDS = [
  "dailyLimitEssential",
  "dailyLimitPro",
  "dailyLimitEnterprise",
  "monthlyLimitEssential",
  "monthlyLimitPro",
  "monthlyLimitEnterprise",
  "maxMonthlyCostBudget",
  "alertThreshold",
  "blockOnExceed",
  "alertAdminOnExceed",
  "enableCache",
  "compressPrompts",
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

function pickAllowed(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) {
      out[key] = body[key];
    }
  }
  return out;
}

export async function GET() {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    // Get or create global settings
    let settings = await prisma.globalAISettings.findFirst();

    if (!settings) {
      // bootstrap חד-פעמי — עטוף ב-withAudit כי זה יצירה של רשומה שמשפיעה על
      // כסף (maxMonthlyCostBudget) ועל יכולת המשתמשים (dailyLimit*).
      settings = await withAudit(
        { kind: "user", session },
        {
          action: "seed_default_ai_settings",
          targetType: "global_ai_settings",
          targetId: GLOBAL_SETTINGS_ID,
          details: { reason: "first-time bootstrap" },
        },
        async (tx) =>
          tx.globalAISettings.create({
            data: {
              id: GLOBAL_SETTINGS_ID,
              // פריטי ברירת מחדל מסודרים — זהים ל-prisma/seed.ts ל-parity
              // (Cursor round 1.18.2 — סוכן 5).
              dailyLimitEssential: 0,
              dailyLimitPro: 30,
              dailyLimitEnterprise: 100,
              monthlyLimitEssential: 0,
              monthlyLimitPro: 600,
              monthlyLimitEnterprise: 2000,
              maxMonthlyCostBudget: 5000,
              alertThreshold: 4000,
              blockOnExceed: false,
              alertAdminOnExceed: true,
              enableCache: true,
              compressPrompts: true,
            },
          })
      );
    }

    return NextResponse.json(serializePrisma(settings));
  } catch (error) {
    logger.error("Error fetching AI settings:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות AI" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const rawBody = (await request.json()) as Record<string, unknown>;
    const data = pickAllowed(rawBody);

    // snapshot של הערכים הקודמים ל-audit (forensic quality — סוכן 1 סיבוב 1)
    // הגדרות AI משפיעות על כסף (maxMonthlyCostBudget, alertThreshold) ועל
    // יכולת המשתמש (dailyLimit*) — שינוי חייב להיות מתועד באופן מלא.
    const previous = await prisma.globalAISettings.findUnique({
      where: { id: GLOBAL_SETTINGS_ID },
    });
    const previousSnapshot: Record<string, unknown> = {};
    const newSnapshot: Record<string, unknown> = {};
    if (previous) {
      for (const key of Object.keys(data)) {
        previousSnapshot[key] = (previous as Record<string, unknown>)[key];
        newSnapshot[key] = data[key];
      }
    }

    // id קבוע — לא מהגוף.
    // מונע תקיפות mass-assignment כגון שליחת id זר שיכתוב על רשומה אחרת.
    const settings = await withAudit(
      { kind: "user", session },
      {
        action: "update_ai_settings",
        targetType: "global_ai_settings",
        targetId: GLOBAL_SETTINGS_ID,
        details: {
          changedFields: Object.keys(data),
          previous: previousSnapshot,
          next: newSnapshot,
        },
      },
      async (tx) =>
        tx.globalAISettings.upsert({
          where: { id: GLOBAL_SETTINGS_ID },
          create: {
            id: GLOBAL_SETTINGS_ID,
            ...data,
          },
          update: data,
        })
    );

    return NextResponse.json(serializePrisma(settings));
  } catch (error) {
    logger.error("Error saving AI settings:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות AI" },
      { status: 500 }
    );
  }
}

export type { AllowedField };
