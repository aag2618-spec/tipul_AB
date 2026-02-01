import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

// GET - Get all billing providers for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providers = await prisma.billingProvider.findMany({
      where: {
        userId: session.user.id,
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
    console.error("Error fetching billing providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing providers" },
      { status: 500 }
    );
  }
}

// POST - Add/Update a billing provider
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { provider, apiKey, apiSecret, displayName } = body;

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Missing required fields: provider, apiKey" },
        { status: 400 }
      );
    }

    // Valid provider types
    const validProviders = [
      "MESHULAM",
      "ICOUNT",
      "GREEN_INVOICE",
      "SUMIT",
      "PAYPLUS",
      "CARDCOM",
      "TRANZILA",
    ];

    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider type" },
        { status: 400 }
      );
    }

    // הצפנת ה-API Key
    const encryptedApiKey = encrypt(apiKey);
    const encryptedApiSecret = apiSecret ? encrypt(apiSecret) : null;

    // בדיקה אם כבר קיים ספק מסוג זה
    const existing = await prisma.billingProvider.findFirst({
      where: {
        userId: session.user.id,
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
          userId: session.user.id,
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
    console.error("Error creating billing provider:", error);
    return NextResponse.json(
      { error: "Failed to save billing provider" },
      { status: 500 }
    );
  }
}
