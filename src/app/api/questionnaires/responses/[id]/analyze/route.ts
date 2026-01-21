import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

// POST - Analyze questionnaire with AI
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get response with template
    const response = await prisma.questionnaireResponse.findFirst({
      where: {
        id,
        therapistId: session.user.id,
      },
      include: {
        template: true,
        client: {
          select: {
            id: true,
            name: true,
            birthDate: true,
          },
        },
      },
    });

    if (!response) {
      return NextResponse.json(
        { error: "Response not found" },
        { status: 404 }
      );
    }

    if (response.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Questionnaire must be completed before analysis" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Build analysis prompt based on test type
    const template = response.template;
    const testType = (template as any).testType || "SELF_REPORT";
    const answers = response.answers as any[];
    const questions = template.questions as any[];
    const scoring = template.scoring as any;

    let prompt = "";
    
    if (testType === "SELF_REPORT" || testType === "CLINICIAN_RATED") {
      // Standard questionnaire analysis
      const answersText = questions.map((q: any, i: number) => {
        const answer = answers[i];
        const selectedOption = q.options?.find((o: any) => o.value === answer?.value);
        return `${q.id}. ${q.title}: ${selectedOption?.text || answer?.value || "לא נענה"} (ציון: ${answer?.value || 0})`;
      }).join("\n");

      prompt = `אתה פסיכולוג קליני מומחה באבחון פסיכולוגי. נתח את תוצאות השאלון הבא:

שאלון: ${template.name} (${template.nameEn || template.code})
קטגוריה: ${template.category || "כללי"}
תיאור: ${template.description || ""}

פרטי הנבדק:
- שם: ${response.client.name}
- גיל: ${response.client.birthDate ? Math.floor((Date.now() - new Date(response.client.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "לא ידוע"}

ציון כולל: ${response.totalScore || "לא חושב"}

תשובות:
${answersText}

${scoring ? `מידע על הציון:
${JSON.stringify(scoring, null, 2)}` : ""}

אנא ספק ניתוח קליני מקיף הכולל:
1. פרשנות הציון הכולל והמשמעות הקלינית
2. זיהוי דפוסים ותחומי דאגה מרכזיים
3. נקודות חוזק שזוהו
4. המלצות לטיפול והמשך אבחון
5. שאלות נוספות לבירור

כתוב בעברית מקצועית אך נגישה.`;

    } else if (testType === "PROJECTIVE") {
      // Projective test analysis
      prompt = `אתה פסיכולוג קליני מומחה במבחנים השלכתיים. נתח את תוצאות המבחן הבא:

מבחן: ${template.name} (${template.nameEn || template.code})

פרטי הנבדק:
- שם: ${response.client.name}
- גיל: ${response.client.birthDate ? Math.floor((Date.now() - new Date(response.client.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "לא ידוע"}

תגובות ונתונים:
${JSON.stringify(answers, null, 2)}

${scoring ? `מידע על הניתוח:
${JSON.stringify(scoring, null, 2)}` : ""}

אנא ספק ניתוח קליני מקיף הכולל:
1. ניתוח תמטי של התוכן
2. הערכת מבנה האישיות
3. מנגנוני הגנה שזוהו
4. יחסי אובייקט
5. תפקודי אגו
6. אינטגרציה דיאגנוסטית
7. המלצות להמשך

כתוב בעברית מקצועית.`;

    } else if (testType === "INTELLIGENCE") {
      // Intelligence test analysis
      prompt = `אתה נוירופסיכולוג קליני מומחה במבחני אינטליגנציה. נתח את תוצאות המבחן הבא:

מבחן: ${template.name} (${template.nameEn || template.code})

פרטי הנבדק:
- שם: ${response.client.name}
- גיל: ${response.client.birthDate ? Math.floor((Date.now() - new Date(response.client.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "לא ידוע"}

ציונים:
${JSON.stringify(answers, null, 2)}

${response.subscores ? `ציוני מדדים:
${JSON.stringify(response.subscores, null, 2)}` : ""}

${scoring ? `מידע נורמטיבי:
${JSON.stringify(scoring, null, 2)}` : ""}

אנא ספק ניתוח קוגניטיבי מקיף הכולל:
1. רמת התפקוד האינטלקטואלי הכללי
2. ניתוח פרופיל - חוזקות וחולשות יחסיות
3. פערים משמעותיים בין מדדים
4. השלכות על תפקוד יומיומי ולימודי/תעסוקתי
5. המלצות להתאמות והתערבויות
6. שאלות לבירור נוסף

כתוב בעברית מקצועית.`;

    } else {
      // Generic analysis
      prompt = `אתה פסיכולוג קליני. נתח את תוצאות ההערכה הבאה:

כלי: ${template.name}
נתונים: ${JSON.stringify(answers, null, 2)}

ספק ניתוח קליני והמלצות.`;
    }

    const result = await model.generateContent(prompt);
    const analysisText = result.response.text();

    // Save analysis to response
    const updatedResponse = await prisma.questionnaireResponse.update({
      where: { id },
      data: {
        aiAnalysis: analysisText,
        status: "ANALYZED",
      },
    });

    // Log API usage
    await prisma.apiUsageLog.create({
      data: {
        userId: session.user.id,
        endpoint: "questionnaire-analysis",
        method: "POST",
        tokensUsed: 0, // Gemini doesn't return token count in same way
        cost: 0,
      },
    });

    return NextResponse.json({
      success: true,
      analysis: analysisText,
      response: updatedResponse,
    });
  } catch (error) {
    console.error("Error analyzing questionnaire:", error);
    return NextResponse.json(
      { error: "Failed to analyze questionnaire" },
      { status: 500 }
    );
  }
}
