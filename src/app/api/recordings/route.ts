import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";
import { validateBase64Size, validateFileBuffer } from "@/lib/file-validation";
import { parseBody, parseSearchParams } from "@/lib/validations/helpers";
import { createRecordingSchema, listRecordingsQuerySchema } from "@/lib/validations/recording";
import {
  checkRateLimit,
  rateLimitResponse,
  RECORDING_UPLOAD_PER_USER,
} from "@/lib/rate-limit";

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

    const parsedQuery = parseSearchParams(request.url, listRecordingsQuerySchema);
    if ("error" in parsedQuery) return parsedQuery.error;
    const { clientId, status } = parsedQuery.data;

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

    // M13.3: rate-limit על העלאת הקלטות פר-user.
    // הסדר: auth → scope → rate-limit → parse → DB.
    // rate-limit אחרי scope כדי לא להציף לוגים כש-secretary חסום ממילא ב-403.
    const rateCheck = checkRateLimit(`recording-upload:${userId}`, RECORDING_UPLOAD_PER_USER);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    const clientWhere = buildClientWhere(scopeUser);

    const parsed = await parseBody(request, createRecordingSchema);
    if ("error" in parsed) return parsed.error;
    const { audioData, mimeType, durationSeconds, type, clientId, sessionId } = parsed.data;

    // H5: בדיקת גודל ל-base64 לפני המרה ל-Buffer (חוסך זיכרון ב-DoS).
    const sizeCheck = validateBase64Size(audioData, "recording");
    if (!sizeCheck.ok) {
      return NextResponse.json({ message: sizeCheck.error }, { status: 413 });
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

    // C5: וידוא שה-sessionId שייך ל-scope של המשתמש. לפני התיקון תוקף יכל
    // לשלוח sessionId של פגישה בארגון אחר → recording נקשרה לפגישה זרה,
    // עם audio זדוני שיופיע אצל המטפל הקורבן. עכשיו: scope-gated.
    if (sessionId) {
      const sess = await prisma.therapySession.findFirst({
        where: { AND: [{ id: sessionId }, buildSessionWhere(scopeUser)] },
        select: { id: true, clientId: true },
      });
      if (!sess) {
        return NextResponse.json(
          { message: "פגישה לא נמצאה" },
          { status: 404 }
        );
      }
      // אם גם clientId וגם sessionId סופקו — וידוא שהם מתואמים. מונע
      // צירוף audio של מטופל אחד לפגישה של מטופל שני (גם אם שניהם בסקופ).
      if (clientId && sess.clientId && sess.clientId !== clientId) {
        return NextResponse.json(
          { message: "פגישה ומטופל אינם תואמים" },
          { status: 400 }
        );
      }
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(audioData, "base64");

    // H5: validate magic-bytes + MIME של ה-buffer.
    const declaredMime = typeof mimeType === "string" && mimeType ? mimeType : "audio/webm";
    const validation = validateFileBuffer(buffer, declaredMime, "recording");
    if (!validation.ok) {
      return NextResponse.json({ message: validation.error }, { status: 400 });
    }

    // Determine file extension from mime type
    let extension = "webm";
    if (mimeType?.includes("mp3") || mimeType?.includes("mpeg")) {
      extension = "mp3";
    } else if (mimeType?.includes("wav")) {
      extension = "wav";
    } else if (mimeType?.includes("ogg")) {
      extension = "ogg";
    }

    const { randomUUID } = await import("crypto");
    const fileName = `${randomUUID()}.${extension}`;
    const { default: storage } = await import("@/lib/storage");
    await storage.write(`recordings/${fileName}`, buffer, declaredMime);

    const recording = await prisma.recording.create({
      data: {
        audioUrl: `/uploads/recordings/${fileName}`,
        durationSeconds: durationSeconds || Math.round(buffer.length / 16000),
        type: type || "SESSION",
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
