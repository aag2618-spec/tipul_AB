import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { createBillingProviderSchema } from "@/lib/validations/integration";

// GET - Get all billing providers for the current user
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const providers = await prisma.billingProvider.findMany({
      where: {
        userId: userId,
      },
      select: {
        id: true,
        provider: true,
        displayName: true,
        isActive: true,
        isPrimary: true,
        lastSyncAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(providers);
  } catch (error) {
    logger.error("Error fetching billing providers:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch billing providers" },
      { status: 500 }
    );
  }
}

// POST - Add/Update a billing provider
export async function POST(request: NextRequest) {
  try {
    // disallowImpersonation: הוספת/עדכון ספק חיוב = שיוך מפתחות API לחשבון.
    // פעולה רגישה — OWNER לא ישייך apiKey/apiSecret של ה-target בשמו.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const parsed = await parseBody(request, createBillingProviderSchema);
    if ("error" in parsed) return parsed.error;
    const { provider, apiKey, apiSecret, displayName } = parsed.data;

    // הצפנת ה-API Key
    const encryptedApiKey = encrypt(apiKey);
    const encryptedApiSecret = apiSecret ? encrypt(apiSecret) : null;

    // בדיקה אם כבר קיים ספק מסוג זה
    const existing = await prisma.billingProvider.findFirst({
      where: {
        userId: userId,
        provider,
      },
    });

    let billingProvider;

    if (existing) {
      // עדכון קיים
      billingProvider = await prisma.billingProvider.update({
        where: { id: existing.id },
        data: {
          apiKey: encryptedApiKey,
          apiSecret: encryptedApiSecret,
          displayName: displayName || `${provider} - חשבון ראשי`,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    } else {
      // יצירת חדש
      billingProvider = await prisma.billingProvider.create({
        data: {
          userId: userId,
          provider,
          apiKey: encryptedApiKey,
          apiSecret: encryptedApiSecret,
          displayName: displayName || `${provider} - חשבון ראשי`,
          isActive: true,
          isPrimary: true, // אוטומטית ראשי אם זה הראשון
        },
      });
    }

    return NextResponse.json(
      { 
        success: true, 
        message: "הספק נוסף בהצלחה",
        provider: {
          id: billingProvider.id,
          provider: billingProvider.provider,
          displayName: billingProvider.displayName,
        }
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Error creating billing provider:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to save billing provider" },
      { status: 500 }
    );
  }
}
