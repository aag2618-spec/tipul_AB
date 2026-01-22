import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import JSZip from "jszip";
import { format } from "date-fns";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    // Fetch all client data
    const client = await prisma.client.findFirst({
      where: { id, therapistId: session.user.id },
      include: {
        therapySessions: {
          include: {
            sessionNote: true,
            payment: true,
          },
          orderBy: { startTime: "desc" },
        },
        payments: {
          orderBy: { createdAt: "desc" },
        },
        recordings: {
          include: {
            transcription: {
              include: { analysis: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
        questionnaireResponses: {
          include: { template: true },
          orderBy: { completedAt: "desc" },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Create ZIP file
    const zip = new JSZip();

    // Add client info
    const clientInfo = `
תיק מטופל: ${client.name}
תאריך יצירה: ${format(new Date(), "dd/MM/yyyy HH:mm")}

פרטי המטופל:
--------------
שם: ${client.name}
טלפון: ${client.phone || "לא צוין"}
אימייל: ${client.email || "לא צוין"}
תאריך לידה: ${client.birthDate ? format(new Date(client.birthDate), "dd/MM/yyyy") : "לא צוין"}
כתובת: ${client.address || "לא צוין"}
מצב: ${client.status === "ACTIVE" ? "פעיל" : client.status === "WAITING" ? "ממתין" : "לא פעיל"}

אבחון ראשוני:
${client.initialDiagnosis || "לא הוזן"}

הערות תשאול:
${client.intakeNotes || "אין הערות"}

היסטוריה רפואית:
${client.medicalHistory ? JSON.stringify(client.medicalHistory, null, 2) : "לא צוין"}

הערות נוספות:
${client.notes || "אין הערות"}
    `.trim();

    zip.file("פרטי-מטופל.txt", clientInfo);

    // Add sessions summary
    if (client.therapySessions.length > 0) {
      const sessionsSummary = client.therapySessions
        .map((session, i) => {
          const note = session.sessionNote?.content || "אין סיכום";
          return `
פגישה ${i + 1}
תאריך: ${format(new Date(session.startTime), "dd/MM/yyyy HH:mm")}
סוג: ${session.type === "IN_PERSON" ? "פרונטלי" : session.type === "ONLINE" ? "אונליין" : "טלפון"}
מצב: ${session.status === "COMPLETED" ? "הושלמה" : session.status === "CANCELLED" ? "בוטלה" : "מתוכננת"}
מחיר: ₪${session.price}

סיכום:
${note}
${"=".repeat(50)}
          `.trim();
        })
        .join("\n\n");

      zip.file("פגישות/סיכום-כל-הפגישות.txt", sessionsSummary);
    }

    // Add transcriptions
    for (const recording of client.recordings) {
      if (recording.transcription) {
        const fileName = `תמלולים/תמלול-${format(new Date(recording.createdAt), "yyyy-MM-dd-HHmm")}.txt`;
        const content = `
תמלול הקלטה
תאריך: ${format(new Date(recording.createdAt), "dd/MM/yyyy HH:mm")}
משך: ${Math.floor(recording.durationSeconds / 60)} דקות

${recording.transcription.content}

${recording.transcription.analysis ? `
ניתוח:
-------
${recording.transcription.analysis.summary}
` : ""}
        `.trim();
        zip.file(fileName, content);
      }
    }

    // Add questionnaires
    for (const response of client.questionnaireResponses) {
      const fileName = `שאלונים/${response.template.name}-${format(new Date(response.completedAt || response.createdAt), "yyyy-MM-dd")}.txt`;
      const content = `
שאלון: ${response.template.name}
תאריך: ${format(new Date(response.completedAt || response.createdAt), "dd/MM/yyyy")}
מצב: ${response.status === "COMPLETED" ? "הושלם" : response.status === "ANALYZED" ? "נותח" : "בתהליך"}
${response.totalScore !== null ? `ציון כולל: ${response.totalScore}` : ""}

${response.aiAnalysis || "אין ניתוח"}
      `.trim();
      zip.file(fileName, content);
    }

    // Add payments summary
    if (client.payments.length > 0) {
      const paymentsSummary = `
סיכום תשלומים
==============

${client.payments
  .map((p, i) => `
${i + 1}. תאריך: ${format(new Date(p.createdAt), "dd/MM/yyyy")}
   סכום: ₪${p.amount}
   מצב: ${p.status === "PAID" ? "שולם" : "ממתין"}
   ${p.notes || ""}
`)
  .join("\n")}

סה"כ חוב: ₪${client.payments.filter(p => p.status === "PENDING").reduce((sum, p) => sum + Number(p.amount), 0)}
      `.trim();
      zip.file("תשלומים.txt", paymentsSummary);
    }

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Return as downloadable file
    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${client.name}-תיק-מטופל.zip"`,
      },
    });
  } catch (error) {
    console.error("Export client error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הקובץ" },
      { status: 500 }
    );
  }
}
