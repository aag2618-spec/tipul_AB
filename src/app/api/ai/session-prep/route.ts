import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateSessionPrep } from "@/lib/openai";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, sessionDate } = body;

    if (!clientId) {
      return NextResponse.json(
        { message: "Client ID is required" },
        { status: 400 }
      );
    }

    // Get user with AI settings
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { aiUsageStats: true }
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Check if user has AI access
    if (user.aiTier === 'ESSENTIAL') {
      return NextResponse.json(
        { message: "AI not available in Essential plan. Upgrade to Pro or Enterprise." },
        { status: 403 }
      );
    }

    // Check rate limits
    const globalSettings = await prisma.globalAISettings.findFirst();
    
    if (globalSettings) {
      const dailyLimit = user.aiTier === 'PRO' 
        ? globalSettings.dailyLimitPro 
        : globalSettings.dailyLimitEnterprise;
      
      const monthlyLimit = user.aiTier === 'PRO'
        ? globalSettings.monthlyLimitPro
        : globalSettings.monthlyLimitEnterprise;
      
      // Check daily limit
      if (user.aiUsageStats && user.aiUsageStats.dailyCalls >= dailyLimit) {
        if (globalSettings.blockOnExceed) {
          return NextResponse.json(
            { message: `הגעת למכסה היומית (${dailyLimit} קריאות). נסה שוב מחר.` },
            { status: 429 }
          );
        }
      }
      
      // Check monthly limit
      if (user.aiUsageStats && user.aiUsageStats.currentMonthCalls >= monthlyLimit) {
        if (globalSettings.blockOnExceed) {
          return NextResponse.json(
            { message: `הגעת למכסה החודשית (${monthlyLimit} קריאות).` },
            { status: 429 }
          );
        }
      }
    }

    // Get client
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });

    if (!client || client.therapistId !== session.user.id) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    // Get recent session notes (last 5)
    const recentSessions = await prisma.therapySession.findMany({
      where: {
        clientId,
        status: 'COMPLETED',
        sessionNote: {
          isNot: null
        }
      },
      include: {
        sessionNote: true
      },
      orderBy: { startTime: 'desc' },
      take: 5
    });

    if (recentSessions.length === 0) {
      return NextResponse.json(
        { 
          message: "אין סיכומי פגישות קודמות. כתוב לפחות סיכום אחד כדי להשתמש ב-AI.",
          content: null
        },
        { status: 200 }
      );
    }

    // Prepare data for AI
    const recentNotes = recentSessions
      .filter(s => s.sessionNote?.content)
      .map(s => ({
        date: format(new Date(s.startTime), 'dd/MM/yyyy', { locale: he }),
        content: s.sessionNote!.content
      }));

    // Determine model based on tier
    const model = user.aiTier === 'ENTERPRISE' ? 'gpt-4o' : 'gpt-4o-mini';

    // **SMART LOGIC**: Check client-specific approaches first, fallback to therapist defaults
    const therapeuticApproaches = (client.therapeuticApproaches && client.therapeuticApproaches.length > 0)
      ? client.therapeuticApproaches
      : (user.therapeuticApproaches || []);

    const approachDescription = client.approachNotes || user.approachDescription || undefined;

    // Generate session prep
    const result = await generateSessionPrep({
      clientName: client.name,
      recentNotes,
      sessionDate: sessionDate || format(new Date(), 'dd/MM/yyyy', { locale: he }),
      therapeuticApproaches,
      approachDescription,
      analysisStyle: user.analysisStyle,
      tone: user.aiTone,
      customInstructions: user.customAIInstructions || undefined,
    }, model);

    // Save session prep
    const sessionPrep = await prisma.sessionPrep.create({
      data: {
        userId: session.user.id,
        clientId,
        sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
        content: result.content,
        insights: result.insights,
        recommendations: result.recommendations,
        aiModel: model,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      }
    });

    // Update usage stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    await prisma.aIUsageStats.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        dailyCalls: 1,
        currentMonthCalls: 1,
        currentMonthTokens: result.tokensUsed,
        currentMonthCost: result.cost,
        totalCalls: 1,
        totalCost: result.cost,
        lastResetDate: today,
      },
      update: {
        dailyCalls: {
          increment: 1
        },
        currentMonthCalls: {
          increment: 1
        },
        currentMonthTokens: {
          increment: result.tokensUsed
        },
        currentMonthCost: {
          increment: result.cost
        },
        totalCalls: {
          increment: 1
        },
        totalCost: {
          increment: result.cost
        }
      }
    });

    // Check if exceeded budget and alert admin
    if (globalSettings?.alertAdminOnExceed) {
      const updatedStats = await prisma.aIUsageStats.findUnique({
        where: { userId: session.user.id }
      });
      
      if (updatedStats && Number(updatedStats.currentMonthCost) > Number(globalSettings.alertThreshold)) {
        // TODO: Send alert to admin (email/notification)
        console.warn(`User ${user.email} exceeded cost threshold: ${updatedStats.currentMonthCost}₪`);
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      id: sessionPrep.id,
    });

  } catch (error: any) {
    console.error('Session prep error:', error);
    return NextResponse.json(
      { message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
