// M2: Admin endpoint לצפייה ב-Data Access Audit Log.
//
// אבטחה:
//   • Permission: audit.view_all (ADMIN בלבד, rank 10)
//     הסיבה: data access logs חושפים מי ניגש לאיזה לקוח/הקלטה — מידע
//     רגיש פר עצמו. רק ADMIN רואה.
//   • GET בלבד — אין PATCH/DELETE. הטבלה tamper-proof; מחיקה רק דרך
//     ה-cron retention שמוחק > 12 חודש.
//   • Pagination + filtering: userId, recordType, action, clientId, date range.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("audit.view_all");
    if ("error" in auth) return auth.error;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const requestedSize = parseInt(sp.get("size") || String(PAGE_SIZE), 10);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize));

    const userId = sp.get("userId")?.trim() || undefined;
    const recordType = sp.get("recordType")?.trim() || undefined;
    const recordId = sp.get("recordId")?.trim() || undefined;
    const action = sp.get("action")?.trim() || undefined;
    const clientId = sp.get("clientId")?.trim() || undefined;
    const fromRaw = sp.get("from")?.trim();
    const toRaw = sp.get("to")?.trim();

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (recordType) where.recordType = recordType;
    if (recordId) where.recordId = recordId;
    if (action) where.action = action;
    if (clientId) where.clientId = clientId;

    if (fromRaw || toRaw) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (fromRaw) {
        const d = new Date(fromRaw);
        if (!Number.isNaN(d.getTime())) createdAt.gte = d;
      }
      if (toRaw) {
        const d = new Date(toRaw);
        if (!Number.isNaN(d.getTime())) createdAt.lte = d;
      }
      if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;
    }

    const [total, items] = await Promise.all([
      prisma.dataAccessAuditLog.count({ where }),
      prisma.dataAccessAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    // parse meta JSON לתצוגה נוחה
    const parsed = items.map((r) => ({
      ...r,
      meta: r.meta ? safeParseJson(r.meta) : null,
    }));

    return NextResponse.json({
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
      items: parsed,
    });
  } catch (error) {
    logger.error("[admin/audit/data-access] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת audit log" },
      { status: 500 }
    );
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
