import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import JSZip from "jszip";
import { format } from "date-fns";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "אינך מחובר" }, { status: 401 });
    }

    // Fetch all clients with their related data
    const clients = await prisma.client.findMany({
      where: { therapistId: session.user.id },
      include: {
        therapySessions: {
          orderBy: { startTime: "desc" },
          include: {
            sessionNote: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
        },
        questionnaireResponses: {
          include: {
            template: true,
          },
          orderBy: { createdAt: "desc" },
        },
        recordings: {
          include: {
            transcriptions: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });

    if (clients.length === 0) {
      return NextResponse.json({ error: "לא נמצאו מטופלים" }, { status: 404 });
    }

    const zip = new JSZip();

    // Create a folder for each client
    for (const client of clients) {
      const clientFolder = zip.folder(client.name);
      if (!clientFolder) continue;

      // Client info
      const clientInfo = `פרטי מטופל: ${client.name}
תעודת זהות: ${client.idNumber || "לא צוין"}
טלפון: ${client.phone || "לא צוין"}
אימייל: ${client.email || "לא צוין"}
תאריך לידה: ${client.birthDate ? format(new Date(client.birthDate), "dd/MM/yyyy") : "לא צוין"}
כתובת: ${client.address || "לא צוין"}
סטטוס: ${client.status}
הערות: ${client.notes || "אין"}
אבחנות: ${client.diagnoses || "לא צוין"}
תרופות: ${client.medications || "לא צוין"}
היסטוריה רפואית: ${client.medicalHistory ? JSON.stringify(client.medicalHistory, null, 2) : "אין"}

תאריך יצירה: ${format(new Date(client.createdAt), "dd/MM/yyyy HH:mm")}
עודכן לאחרונה: ${format(new Date(client.updatedAt), "dd/MM/yyyy HH:mm")}
`;
      clientFolder.file("פרטי-מטופל.txt", clientInfo);

      // Sessions summary
      if (client.therapySessions.length > 0) {
        const sessionsFolder = clientFolder.folder("פגישות");
        
        let allSessionsSummary = `סיכום כל הפגישות - ${client.name}\n`;
        allSessionsSummary += `סה"כ ${client.therapySessions.length} פגישות\n\n`;
        allSessionsSummary += "=".repeat(50) + "\n\n";

        client.therapySessions.forEach((session, index) => {
          const sessionText = `פגישה #${client.therapySessions.length - index}
תאריך: ${format(new Date(session.startTime), "dd/MM/yyyy HH:mm")}
סוג: ${session.type}
סטטוס: ${session.status}
${session.notes ? `\nהערות:\n${session.notes}` : ""}
${session.sessionNote?.content ? `\nסיכום:\n${session.sessionNote.content}` : ""}
`;
          
          allSessionsSummary += sessionText + "\n" + "=".repeat(50) + "\n\n";
          
          // Individual session file
          sessionsFolder?.file(
            `פגישה-${format(new Date(session.startTime), "yyyy-MM-dd")}.txt`,
            sessionText
          );
        });

        sessionsFolder?.file("סיכום-כל-הפגישות.txt", allSessionsSummary);
      }

      // Transcriptions
      if (client.recordings.length > 0) {
        const transcFolder = clientFolder.folder("תמלולים");
        
        client.recordings.forEach((recording) => {
          if (recording.transcriptions.length > 0) {
            recording.transcriptions.forEach((trans) => {
              transcFolder?.file(
                `תמלול-${format(new Date(trans.createdAt), "yyyy-MM-dd-HHmm")}.txt`,
                `תמלול הקלטה
תאריך: ${format(new Date(trans.createdAt), "dd/MM/yyyy HH:mm")}
מודל: ${trans.model || "לא צוין"}

תוכן:
${trans.content}
`
              );
            });
          }
        });
      }

      // Questionnaires
      if (client.questionnaireResponses.length > 0) {
        const questFolder = clientFolder.folder("שאלונים");
        
        client.questionnaireResponses.forEach((response) => {
          const questText = `שאלון: ${response.template.name}
תאריך מילוי: ${format(new Date(response.createdAt), "dd/MM/yyyy HH:mm")}
סטטוס: ${response.status}
${response.totalScore !== null ? `ציון: ${response.totalScore}` : ""}

תשובות:
${JSON.stringify(response.answers, null, 2)}

${response.aiAnalysis ? `\nניתוח AI:\n${response.aiAnalysis}` : ""}
`;
          
          questFolder?.file(
            `${response.template.name}-${format(new Date(response.createdAt), "yyyy-MM-dd")}.txt`,
            questText
          );
        });
      }

      // Payments summary
      if (client.payments.length > 0) {
        const paymentsText = `סיכום תשלומים - ${client.name}
סה"כ ${client.payments.length} תשלומים

` + client.payments.map((p, i) => `
תשלום #${i + 1}
תאריך: ${format(new Date(p.createdAt), "dd/MM/yyyy")}
סכום: ₪${p.amount}
סטטוס: ${p.status}
אמצעי תשלום: ${p.method}
${p.notes ? `הערות: ${p.notes}` : ""}
`).join("\n" + "-".repeat(50) + "\n");

        clientFolder.file("תשלומים.txt", paymentsText);
      }
    }

    // Generate ZIP as blob and convert to ArrayBuffer
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const arrayBuffer = await zipBlob.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="כל-המטופלים-${format(new Date(), "yyyy-MM-dd")}.zip"`,
      },
    });
  } catch (error) {
    console.error("Error exporting all clients:", error);
    return NextResponse.json(
      { error: "שגיאה ביצירת קובץ הייצוא" },
      { status: 500 }
    );
  }
}
