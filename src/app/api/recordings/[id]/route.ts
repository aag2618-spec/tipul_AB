import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { logDataAccess } from "@/lib/audit-logger";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!canSecretaryAccessModel(scopeUser, "Recording")) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const clientWhere = buildClientWhere(scopeUser);
    const sessionWhere = buildSessionWhere(scopeUser);

    const { id } = await params;

    const recording = await prisma.recording.findFirst({
      where: {
        id,
        OR: [
          { client: clientWhere },
          { session: sessionWhere },
        ],
      },
      include: {
        client: true,
        session: {
          include: {
            client: { select: { id: true, name: true } },
          },
        },
        transcription: {
          include: { analysis: true },
        },
      },
    });

    if (!recording) {
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    // Audit log — קריאה להקלטה (audio URL + transcription content + analysis)
    logDataAccess({
      userId,
      recordType: "RECORDING",
      recordId: id,
      action: "READ",
      clientId: recording.clientId,
      request,
      meta: {
        hasTranscription: !!recording.transcription,
        hasAnalysis: !!recording.transcription?.analysis,
      },
    });

    return NextResponse.json(recording);
  } catch (error) {
    logger.error("Get recording error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההקלטה" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!canSecretaryAccessModel(scopeUser, "Recording")) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const clientWhere = buildClientWhere(scopeUser);
    const sessionWhere = buildSessionWhere(scopeUser);

    const { id } = await params;

    // Atomic delete — ownership נבדק ב-WHERE עצמו, מונע race condition
    const deleteResult = await prisma.recording.deleteMany({
      where: {
        id,
        OR: [
          { client: clientWhere },
          { session: sessionWhere },
        ],
      },
    });

    if (deleteResult.count === 0) {
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    // Audit log — פעולה הרסנית
    logDataAccess({
      userId,
      recordType: "RECORDING",
      recordId: id,
      action: "DELETE",
      request,
    });

    return NextResponse.json({ message: "ההקלטה נמחקה בהצלחה" });
  } catch (error) {
    logger.error("Delete recording error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת ההקלטה" },
      { status: 500 }
    );
  }
}
