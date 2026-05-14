import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { transcribeAudio } from "@/lib/google-ai";
import { readFile } from "fs/promises";
import { join } from "path";
import { logApiUsage, estimateTokens, estimateCost } from "@/lib/api-logger";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";
import { parseBody } from "@/lib/validations/helpers";
import { transcribeRecordingSchema } from "@/lib/validations/ai";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // C4: scope-based ownership. החלפת isOwner הישן (therapistId===userId)
    // שעבד למטפל יחיד אבל שבר את CLINIC_OWNER ולא הגן מ-cross-clinic write.
    const scopeUser = await loadScopeUser(userId);
    if (!canSecretaryAccessModel(scopeUser, "Transcription")) {
      return NextResponse.json(
        { message: "פעולה זו אינה זמינה למזכירה" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, transcribeRecordingSchema);
    if ("error" in parsed) return parsed.error;
    const { recordingId, force } = parsed.data;

    // Get recording within scope: או דרך client בסקופ או דרך session בסקופ.
    // findFirst עם OR מבטיח שמשתמש לא יוכל לקרוא הקלטה מארגון אחר, אבל
    // CLINIC_OWNER יוכל לתמלל הקלטה של מטפל בצוות שלו.
    const recording = await prisma.recording.findFirst({
      where: {
        AND: [
          { id: recordingId },
          {
            OR: [
              { client: buildClientWhere(scopeUser) },
              { session: buildSessionWhere(scopeUser) },
            ],
          },
        ],
      },
      include: {
        client: true,
        session: true,
      },
    });

    if (!recording) {
      // 404 אחיד — לא חושף האם ההקלטה קיימת בארגון אחר.
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    // If force re-transcribe, delete existing transcription
    if (force) {
      const existingTranscription = await prisma.transcription.findUnique({
        where: { recordingId },
      });
      
      if (existingTranscription) {
        // Delete analysis if exists
        await prisma.analysis.deleteMany({
          where: { transcriptionId: existingTranscription.id },
        });
        // Delete transcription
        await prisma.transcription.delete({
          where: { id: existingTranscription.id },
        });
      }
    }

    // Update status to transcribing
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: "TRANSCRIBING" },
    });

    const startTime = Date.now();
    
    try {
      // Check if API key is configured
      if (!process.env.GOOGLE_AI_API_KEY) {
        logger.error("GOOGLE_AI_API_KEY is not set");
        throw new Error("API key not configured");
      }

      // Read audio file - remove leading slash if present
      const relativePath = recording.audioUrl.startsWith('/') 
        ? recording.audioUrl.slice(1) 
        : recording.audioUrl;
      
      // Use persistent disk on Render, fallback to local for development
      let filePath: string;
      if (process.env.UPLOADS_DIR) {
        // On Render with persistent disk
        // audioUrl is like: /uploads/recordings/xxx.webm
        // We need: /var/data/uploads/recordings/xxx.webm
        filePath = join(process.env.UPLOADS_DIR, relativePath.replace('uploads/', ''));
      } else {
        // Local development
        filePath = join(process.cwd(), relativePath);
      }
      
      // H6 — הסרנו console.log שדלפו PII (audioUrl, filePath, UPLOADS_DIR).
      // אם נדרש debug — להשתמש ב-logger.debug שלא רץ ב-production.
      const audioBuffer = await readFile(filePath);
      const audioBase64 = audioBuffer.toString("base64");

      // Determine mime type
      const mimeType = recording.audioUrl.endsWith(".webm")
        ? "audio/webm"
        : recording.audioUrl.endsWith(".ogg")
        ? "audio/ogg"
        : "audio/mpeg";

      // Transcribe with Google AI Studio
      const result = await transcribeAudio(audioBase64, mimeType);

      // Save transcription
      const transcription = await prisma.transcription.create({
        data: {
          recordingId,
          content: result.text,
          language: "he",
          confidence: result.confidence,
        },
      });

      // Update recording status
      await prisma.recording.update({
        where: { id: recordingId },
        data: { status: "TRANSCRIBED" },
      });

      // Log API usage
      const durationMs = Date.now() - startTime;
      const tokensUsed = estimateTokens(result.text);
      await logApiUsage({
        userId: userId,
        endpoint: "/api/transcribe",
        method: "POST",
        tokensUsed,
        cost: estimateCost(tokensUsed),
        success: true,
        durationMs,
      });

      return NextResponse.json(transcription, { status: 201 });
    } catch (transcriptionError: unknown) {
      const errorMessage = transcriptionError instanceof Error 
        ? transcriptionError.message 
        : "Unknown error";
      logger.error("Transcription failed:", { error: errorMessage });
      
      // Update status to error
      await prisma.recording.update({
        where: { id: recordingId },
        data: { status: "ERROR" },
      });

      // Log failed API usage
      const durationMs = Date.now() - startTime;
      await logApiUsage({
        userId: userId,
        endpoint: "/api/transcribe",
        method: "POST",
        success: false,
        errorMessage,
        durationMs,
      });

      return NextResponse.json(
        { message: `שגיאה בתמלול: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Transcribe error:", { error: errorMessage });
    return NextResponse.json(
      { message: `אירעה שגיאה בתמלול: ${errorMessage}` },
      { status: 500 }
    );
  }
}








