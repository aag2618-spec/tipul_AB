// src/app/api/admin/terms/route.ts
// API לצפייה באישורי תנאים - רק לאדמין
// רשומות אלו הן הוכחה חוקית ולא ניתנות למחיקה

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.terms");
    if ("error" in auth) return auth.error;

    // פרמטרים
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // בניית query
    const where: Record<string, unknown> = {};
    if (userId) {
      where.userId = userId;
    }

    const [records, total] = await Promise.all([
      prisma.termsAcceptance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          userEmail: true,
          userName: true,
          termsVersion: true,
          termsType: true,
          acceptedContent: true,
          action: true,
          planSelected: true,
          billingMonths: true,
          amountAgreed: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
      prisma.termsAcceptance.count({ where }),
    ]);

    return NextResponse.json({
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Terms acceptance query error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בשליפת אישורי תנאים" },
      { status: 500 }
    );
  }
}

// אין DELETE - רשומות אלו לעולם לא נמחקות!
// אין PUT/PATCH - רשומות אלו לא ניתנות לעריכה!
