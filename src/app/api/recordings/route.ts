import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      client: { therapistId: userId },
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

    const body = await request.json();
    const { audioData, mimeType, durationSeconds, type, clientId, sessionId } = body;

    if (!audioData) {
      return NextResponse.json(
        { message: "לא נשלח קובץ אודיו" },
        { status: 400 }
      );
    }

    // Verify client belongs to therapist
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, therapistId: userId },
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

    const baseDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
    const uploadsDir = path.join(baseDir, "recordings");
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileName = `${Date.now()}.${extension}`;
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
