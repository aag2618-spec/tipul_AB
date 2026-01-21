import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { analyzeSession, analyzeIntake } from "@/lib/google-ai";
import { logApiUsage, estimateTokens, estimateCost } from "@/lib/api-logger";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { transcriptionId, type } = body;

    if (!transcriptionId) {
      return NextResponse.json(
        { message: "נא לספק מזהה תמלול" },
        { status: 400 }
      );
    }

    // Get transcription with recording
    const transcription = await prisma.transcription.findFirst({
      where: { id: transcriptionId },
      include: {
        recording: {
          include: {
            client: { select: { therapistId: true } },
            session: { select: { therapistId: true } },
          },
        },
      },
    });

    if (!transcription) {
      return NextResponse.json({ message: "תמלול לא נמצא" }, { status: 404 });
    }

    // Verify ownership
    const isOwner =
      transcription.recording.client?.therapistId === session.user.id ||
      transcription.recording.session?.therapistId === session.user.id;

    if (!isOwner) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const startTime = Date.now();
    
    try {
      // Analyze based on type
      const analysisResult =
        type === "INTAKE"
          ? await analyzeIntake(transcription.content)
          : await analyzeSession(transcription.content);

      // Save analysis
      const analysis = await prisma.analysis.create({
        data: {
          transcriptionId,
          summary: "summary" in analysisResult ? analysisResult.summary : "",
          keyTopics: "keyTopics" in analysisResult && analysisResult.keyTopics ? analysisResult.keyTopics : undefined,
          emotionalMarkers:
            "emotionalMarkers" in analysisResult && analysisResult.emotionalMarkers
              ? analysisResult.emotionalMarkers
              : undefined,
          recommendations: analysisResult.recommendations || undefined,
          nextSessionNotes:
            "nextSessionNotes" in analysisResult
              ? analysisResult.nextSessionNotes
              : null,
        },
      });

      // Update recording status
      await prisma.recording.update({
        where: { id: transcription.recordingId },
        data: { status: "ANALYZED" },
      });

      // Complete related task
      await prisma.task.updateMany({
        where: {
          userId: session.user.id,
          relatedEntityId: transcription.recordingId,
          type: "REVIEW_TRANSCRIPTION",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });

      // Log API usage
      const durationMs = Date.now() - startTime;
      const tokensUsed = estimateTokens(transcription.content) + estimateTokens(JSON.stringify(analysisResult));
      await logApiUsage({
        userId: session.user.id,
        endpoint: "/api/analyze",
        method: "POST",
        tokensUsed,
        cost: estimateCost(tokensUsed),
        success: true,
        durationMs,
      });

      return NextResponse.json(analysis, { status: 201 });
    } catch (analysisError) {
      const errorMessage = analysisError instanceof Error ? analysisError.message : String(analysisError);
      console.error("Analysis failed:", errorMessage, analysisError);
      
      // Log failed API usage
      const durationMs = Date.now() - startTime;
      await logApiUsage({
        userId: session.user.id,
        endpoint: "/api/analyze",
        method: "POST",
        success: false,
        errorMessage,
        durationMs,
      });
      
      return NextResponse.json(
        { message: `שגיאה בניתוח התמלול: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בניתוח" },
      { status: 500 }
    );
  }
}

