import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { buildClientWhere, isSecretary, loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);

    // סיכומי טיפול = תוכן קליני טהור (sessionNote.content + comprehensiveAnalysis).
    // מזכירה חסומה לחלוטין.
    if (isSecretary(scopeUser)) {
      logger.warn("[clients/summaries] Secretary attempted clinical access", {
        userId,
        clientId: id,
      });
      return NextResponse.json(
        { message: "אין הרשאה לתוכן קליני (סיכומי טיפול)" },
        { status: 403 }
      );
    }

    const scopeWhere = buildClientWhere(scopeUser);

    const client = await prisma.client.findFirst({
      where: { AND: [{ id }, scopeWhere] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        comprehensiveAnalysis: true,
        comprehensiveAnalysisAt: true,
        therapySessions: {
          where: {
            sessionNote: { isNot: null },
          },
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            type: true,
            sessionNote: {
              select: {
                id: true,
                content: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    logger.error("Get client summaries error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הסיכומים" },
      { status: 500 }
    );
  }
}
