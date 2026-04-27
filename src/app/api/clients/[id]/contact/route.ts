// src/app/api/clients/[id]/contact/route.ts
// Endpoint קל-משקל המחזיר רק שדות יצירת קשר (phone, email, name) של לקוח.
// משמש את ChargeCardcomDialog כשה-call site לא העביר את הנתונים כ-props
// (חוסך טעינה של ההיסטוריה המלאה דרך GET /api/clients/[id]).

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
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        therapistId: true,
      },
    });
    if (!client) {
      return NextResponse.json({ message: "לקוח לא נמצא" }, { status: 404 });
    }
    if (client.therapistId !== userId) {
      return NextResponse.json({ message: "אין הרשאה ללקוח זה" }, { status: 403 });
    }
    return NextResponse.json({
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
    });
  } catch (err) {
    logger.error("[clients/contact] failed", {
      clientId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בטעינת לקוח" }, { status: 500 });
  }
}
