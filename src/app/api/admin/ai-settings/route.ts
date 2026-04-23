import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    // Get or create global settings
    let settings = await prisma.globalAISettings.findFirst();
    
    if (!settings) {
      // Create default settings
      settings = await prisma.globalAISettings.create({
        data: {
          dailyLimitPro: 30,
          dailyLimitEnterprise: 100,
          monthlyLimitPro: 600,
          monthlyLimitEnterprise: 2000,
          maxMonthlyCostBudget: 5000,
          alertThreshold: 4000,
          blockOnExceed: false,
          alertAdminOnExceed: true,
          enableCache: true,
          compressPrompts: true,
        }
      });
    }

    return NextResponse.json(serializePrisma(settings));
  } catch (error) {
    logger.error('Error fetching AI settings:', { error: error instanceof Error ? error.message : String(error) });
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

    const body = await request.json();

    // Update or create settings
    const settings = await prisma.globalAISettings.upsert({
      where: { id: body.id || 'default' },
      create: {
        id: 'default',
        ...body
      },
      update: body
    });

    return NextResponse.json(serializePrisma(settings));
  } catch (error) {
    logger.error('Error saving AI settings:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות AI" },
      { status: 500 }
    );
  }
}
