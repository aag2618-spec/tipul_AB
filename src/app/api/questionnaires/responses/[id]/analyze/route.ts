import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachById, getApproachPrompts, buildIntegrationSection, getScalesPrompt, getUniversalPromptsLight } from "@/lib/therapeutic-approaches";

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

    // Get response with template and client approaches
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
            therapeuticApproaches: true,
            culturalContext: true,
          },
        },
      },
    });
    
    // Get user with tier and approaches
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        aiTier: true,
        therapeuticApproaches: true,
      }
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

    // Build approach section for ENTERPRISE tier
    let approachSection = '';
    let approachNamesFull = '';
    if (user?.aiTier === 'ENTERPRISE') {
      const therapeuticApproaches = (response.client?.therapeuticApproaches && response.client.therapeuticApproaches.length > 0)
        ? response.client.therapeuticApproaches
        : (user.therapeuticApproaches || []);
      
      if (therapeuticApproaches.length > 0) {
        approachNamesFull = therapeuticApproaches
          .map((id: string) => {
            const approach = getApproachById(id);
            return approach ? approach.nameHe : null;
          })
          .filter(Boolean)
          .join(", ");
        
        const approachPrompts = getApproachPrompts(therapeuticApproaches);
        const integrationSection = buildIntegrationSection(therapeuticApproaches);
        
        approachSection = `
=== גישות טיפוליות: ${approachNamesFull} ===

${approachPrompts}

${integrationSection}
`;
      }
    }

    // Cultural context
    const culturalSection = response.client?.culturalContext
      ? `\nהקשר תרבותי חשוב:\n${response.client.culturalContext}\nשים לב: אל תפרש תשובות שמשקפות נורמות תרבותיות כפתולוגיה. התאם את הפרשנות בהתאם.\n`
      : '';

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

      prompt = `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים. דוגמה: "פיצול (Splitting)"
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד

הנחיה: תתעלם מהתשובה ה"מובנת מאליה" וחפש את הפרדוקס.

אתה פסיכולוג קליני ברמה אקדמית גבוהה. נתח את תוצאות השאלון ברמה של פסיכולוג בכיר.
${approachSection}
${culturalSection}

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

בצע ניתוח קליני מעמיק${approachNamesFull ? ` לפי ${approachNamesFull}` : ''}:

1. פרשנות קלינית:
• משמעות הציון הכולל (טווח: נורמלי/קל/בינוני/חמור)
${approachNamesFull ? `• פרשנות ספציפית לפי ${approachNamesFull}` : ''}

2. סימנים מחשידים (Red Flags):
• פריטים קריטיים שדורשים תשומת לב מיידית
• סתירות בתשובות - למשל דיווח על מצב רוח טוב אבל שינה מופרעת
• תשובות שנראות "חברתית רצויות" (רצוי חברתית - Social Desirability)

3. דפוסים ותובנות:
• דפוסים בולטים בתשובות${approachNamesFull ? ` דרך העדשה של ${approachNamesFull}` : ''}
• מה המטופל לא אומר - חסרים בולטים

4. נקודות חוזק:
• משאבים פנימיים שעולים מהתשובות

5. המלצות קליניות:
• המלצות לטיפול${approachNamesFull ? ` בהתאם ל-${approachNamesFull}` : ''}
• שאלות שכדאי לשאול בפגישה הבאה
• המלצות להמשך אבחון

כל מונח אנגלי חייב להופיע עם תרגום פשוט בעברית.

${getUniversalPromptsLight()}`;

    } else if (testType === "PROJECTIVE") {
      // Projective test analysis
      prompt = `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד

הנחיה: חפש את מה שלא נאמר - ההשמטות במבחנים השלכתיים חשובות לא פחות מהתוכן.

אתה פסיכולוג קליני ברמה אקדמית גבוהה, מומחה במבחנים השלכתיים (מבחנים השלכתיים - Projective Tests).
${approachSection}
${culturalSection}

מבחן: ${template.name} (${template.nameEn || template.code})

פרטי הנבדק:
- שם: ${response.client.name}
- גיל: ${response.client.birthDate ? Math.floor((Date.now() - new Date(response.client.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "לא ידוע"}

תגובות ונתונים:
${JSON.stringify(answers, null, 2)}

${scoring ? `מידע על הניתוח:
${JSON.stringify(scoring, null, 2)}` : ""}

בצע ניתוח קליני מעמיק${approachNamesFull ? ` לפי ${approachNamesFull}` : ''}:

1. ניתוח תמטי (ניתוח תמטי - Thematic Analysis):
• נושאים מרכזיים בתוכן
• תמות חוזרות ומה הן מייצגות
${approachNamesFull ? `• פרשנות לפי ${approachNamesFull}` : ''}

2. מבנה אישיות (מבנה אישיות - Personality Structure):
• רמת ארגון האישיות - נוירוטי/גבולי/פסיכוטי
• כוחות ופגיעויות

3. מנגנוני הגנה (מנגנוני הגנה - Defense Mechanisms):
• מנגנונים בשלים (הומור, סובלימציה) לעומת פרימיטיביים (פיצול, הכחשה)
• מה המנגנונים מגנים עליו?

4. יחסי אובייקט (יחסי אובייקט - Object Relations):
• איכות הייצוגים הפנימיים
• דמויות אנושיות - שלמות או חלקיות?
${approachNamesFull ? `• פרשנות לפי ${approachNamesFull}` : ''}

5. תפקודי אגו (תפקודי אגו - Ego Functions):
• בדיקת מציאות, שיפוט, ויסות רגשי
• חשיבה - לוגית, משוחררת, מתפרקת?

6. סימנים מחשידים (Red Flags):
• תכנים מדאיגים (אלימות, חוסר אונים, פירוק)
• סימנים לפגיעה בבדיקת מציאות

7. אינטגרציה והמלצות:
• תמונה כוללת
• המלצות לטיפול${approachNamesFull ? ` בהתאם ל-${approachNamesFull}` : ''}
• המלצות להמשך אבחון

כל מונח אנגלי חייב להופיע עם תרגום פשוט בעברית.

${getUniversalPromptsLight()}`;

    } else if (testType === "INTELLIGENCE") {
      // Intelligence test analysis
      prompt = `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד

אתה נוירופסיכולוג קליני ברמה אקדמית גבוהה, מומחה במבחני אינטליגנציה.
${approachSection}
${culturalSection}

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

בצע ניתוח נוירו-קוגניטיבי מעמיק:

1. רמת תפקוד אינטלקטואלי כללי:
• ציון כולל ומשמעותו
• סיווג (ממוצע, מעל/מתחת ממוצע, וכו')

2. ניתוח פרופיל קוגניטיבי (פרופיל קוגניטיבי - Cognitive Profile):
• חוזקות יחסיות - איפה הנבדק מצטיין
• חולשות יחסיות - איפה יש קושי
• פערים משמעותיים בין מדדים (פער מובהק - Significant Discrepancy)

3. השלכות פונקציונליות:
• השפעה על תפקוד יומיומי
• השפעה על למידה/תעסוקה
• תחומים שעלולים להיפגע

4. סימנים מחשידים:
• האם יש חשד ללקות למידה (לקות למידה - Learning Disability)?
• האם יש סימנים של קשב וריכוז (הפרעת קשב - ADHD)?
• פרופיל לא אחיד - מה זה אומר?

5. המלצות:
• התאמות ספציפיות מומלצות
• התערבויות לחיזוק תחומים חלשים
• הפניות מקצועיות נדרשות
• בירורים נוספים

כל מונח אנגלי חייב להופיע עם תרגום פשוט בעברית.

${getUniversalPromptsLight()}`;

    } else {
      // Generic analysis
      prompt = `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד

אתה פסיכולוג קליני. נתח את תוצאות ההערכה הבאה:
${approachSection}
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
