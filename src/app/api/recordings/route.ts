import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  loadScopeUser,
  buildClientWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    // הקלטה היא תוכן קליני — חסום קשיח למזכירה.
    if (!canSecretaryAccessModel(scopeUser, "Recording")) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const clientWhere = buildClientWhere(scopeUser);

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      client: clientWhere,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (status) {
      where.status = status;
    }

    const recordings = await prisma.recording.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: { id: true, name: true },
        },
        session: {
          select: { id: true, startTime: true },
        },
        transcription: {
          select: { id: true, content: true },
          include: {
            analysis: true,
          },
        },
      },
    });

    return NextResponse.json(recordings);
  } catch (error) {
    logger.error("Get recordings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההקלטות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!canSecretaryAccessModel(scopeUser, "Recording")) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const clientWhere = buildClientWhere(scopeUser);

    const body = await request.json();
    const { audioData, mimeType, durationSeconds, type, clientId, sessionId } = body;

    if (!audioData) {
      return NextResponse.json(
        { message: "לא נשלח קובץ אודיו" },
        { status: 400 }
      );
    }

    // Verify client belongs to therapist (or visible scope)
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, clientWhere] },
      });

      if (!client) {
        return NextResponse.json(
          { message: "מטופל לא נמצא" },
          { status: 404 }
        );
      }
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(audioData, "base64");

    // Determine file extension from mime type
    let extension = "webm";
    if (mimeType?.includes("mp3") || mimeType?.includes("mpeg")) {
      extension = "mp3";
    } else if (mimeType?.includes("wav")) {
      extension = "wav";
    } else if (mimeType?.includes("ogg")) {
      extension = "ogg";
    }

    // Save file to uploads folder
    const fs = await import("fs/promises");
    const path = await import("path");
    const { randomUUID } = await import("crypto");

    const baseDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
    const uploadsDir = path.join(baseDir, "recordings");
    await fs.mkdir(uploadsDir, { recursive: true });

    // שם קובץ אקראי (UUID) במקום timestamp — מונע ניחוש ההקלטות
    const fileName = `${randomUUID()}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, buffer);

    const recording = await prisma.recording.create({
      data: {
        audioUrl: `/uploads/recordings/${fileName}`,
        durationSeconds: durationSeconds || Math.round(buffer.length / 16000),
        type: (type as "INTAKE" | "SESSION") || "SESSION",
        status: "PENDING",
        clientId: clientId || null,
        sessionId: sessionId || null,
      },
      include: {
        client: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(recording, { status: 201 });
  } catch (error) {
    logger.error("Create recording error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת ההקלטה" },
      { status: 500 }
    );
  }
}
