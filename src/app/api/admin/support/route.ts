// API: פניות תמיכה — צד אדמין
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — כל הפניות עם סינון
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("support.view_all");
    if ("error" in auth) return auth.error;

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || "all";
    const category = searchParams.get("category") || "all";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};

    if (status !== "all") {
      where.status = status;
    }
    if (category !== "all") {
      where.category = category;
    }
    if (search) {
      const parsed = parseInt(search.replace("#", ""), 10);
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        ...(isNaN(parsed) ? [] : [
          { ticketNumber: parsed },
          { user: { userNumber: parsed } },
        ]),
      ];
    }

    const [tickets, total, stats] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              userNumber: true,
              aiTier: true,
            },
          },
          _count: {
            select: { responses: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.supportTicket.count({ where }),
      Promise.all([
        prisma.supportTicket.count({ where: { status: "OPEN" } }),
        prisma.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
        prisma.supportTicket.count({ where: { status: "RESOLVED" } }),
        prisma.supportTicket.count({ where: { status: "CLOSED" } }),
        prisma.supportTicket.count({ where: { status: "WAITING" } }),
      ]),
    ]);

    return NextResponse.json({
      tickets,
      total,
      stats: {
        open: stats[0],
        inProgress: stats[1],
        resolved: stats[2],
        closed: stats[3],
        waiting: stats[4],
      },
    });
  } catch (error) {
    console.error("שגיאה בטעינת פניות:", error);
    return NextResponse.json({ message: "שגיאה בטעינת הפניות" }, { status: 500 });
  }
}
