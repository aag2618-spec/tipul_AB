// src/app/api/clients/[id]/saved-cards/route.ts
// רשימת כרטיסי אשראי שמורים (Cardcom tokens) ללקוח של המטפל המחובר.
// תומך ב-tenant=USER בלבד; מחזיר רק מטא-נתונים בטוחים (last4, brand, holder, expiry).
// ⚠️ לעולם לא מחזיר את הטוקן עצמו ל-client — הוא נשמר server-side בלבד.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: clientId } = await context.params;

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, therapistId: true },
    });
    if (!client) {
      return NextResponse.json({ message: "לקוח לא נמצא" }, { status: 404 });
    }
    if (client.therapistId !== userId) {
      return NextResponse.json({ message: "אין הרשאה ללקוח זה" }, { status: 403 });
    }

    const tokens = await prisma.savedCardToken.findMany({
      where: {
        tenant: "USER",
        userId,
        clientId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        cardLast4: true,
        cardHolder: true,
        cardBrand: true,
        expiryMonth: true,
        expiryYear: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    // מסמן כרטיסים שתוקפם פג כדי שה-UI יציג אזהרה ויחסום שימוש.
    const now = new Date();
    const enriched = tokens.map((t) => {
      const monthEnd = new Date(t.expiryYear, t.expiryMonth, 0, 23, 59, 59);
      return { ...t, isExpired: monthEnd < now };
    });

    return NextResponse.json({ tokens: enriched });
  } catch (err) {
    logger.error("[clients/saved-cards] list failed", {
      clientId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בטעינת כרטיסים" }, { status: 500 });
  }
}
