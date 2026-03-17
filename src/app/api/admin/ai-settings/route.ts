import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

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

    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Error fetching AI settings:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

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

    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Error saving AI settings:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
