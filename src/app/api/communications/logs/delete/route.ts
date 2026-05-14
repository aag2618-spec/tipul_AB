import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { deleteCommunicationLogsSchema } from "@/lib/validations/communications";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const parsed = await parseBody(request, deleteCommunicationLogsSchema);
    if ("error" in parsed) return parsed.error;
    const { ids } = parsed.data;

    const result = await prisma.communicationLog.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.error("Delete communication logs error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה במחיקה" }, { status: 500 });
  }
}
