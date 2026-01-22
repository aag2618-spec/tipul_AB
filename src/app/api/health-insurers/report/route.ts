import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { format } from "date-fns";

// Types of health insurance companies in Israel
enum HealthInsurer {
  CLALIT = "CLALIT",
  MACCABI = "MACCABI",
  MEUHEDET = "MEUHEDET",
  LEUMIT = "LEUMIT",
}

interface InsurerReport {
  insurer: HealthInsurer;
  clientName: string;
  clientId: string;
  sessionDate: Date;
  sessionType: string;
  diagnosis: string;
  treatmentPlan: string;
  sessionNotes: string;
  therapistLicense: string;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { insurer, sessionId } = body;

    // Get therapist details
    const therapist = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        license: true,
        name: true,
      },
    });

    if (!therapist?.license) {
      return NextResponse.json(
        { error: "נדרש מספר רישיון לשליחת דיווחים" },
        { status: 400 }
      );
    }

    // Get session details
    const therapySession = await prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: {
        client: true,
        sessionNote: true,
      },
    });

    if (!therapySession || therapySession.therapistId !== session.user.id) {
      return NextResponse.json({ error: "פגישה לא נמצאה" }, { status: 404 });
    }

    if (!therapySession.client) {
      return NextResponse.json(
        { error: "לא ניתן לשלוח דיווח לפגישת הפסקה" },
        { status: 400 }
      );
    }

    // Generate report based on insurer
    const report = await generateInsurerReport({
      insurer: insurer as HealthInsurer,
      clientName: therapySession.client.name,
      clientId: therapySession.client.id,
      sessionDate: therapySession.startTime,
      sessionType: therapySession.type,
      diagnosis: therapySession.client.initialDiagnosis || "",
      treatmentPlan: "",
      sessionNotes: therapySession.sessionNote?.content || therapySession.notes || "",
      therapistLicense: therapist.license,
    });

    // In production, this would send to the actual insurer API
    // For now, we return the formatted report
    return NextResponse.json({
      success: true,
      report,
      message: `דיווח ל${getInsurerName(insurer)} נוצר בהצלחה`,
    });
  } catch (error) {
    console.error("Health insurer report error:", error);
    return NextResponse.json(
      { error: "שגיאה ביצירת הדיווח" },
      { status: 500 }
    );
  }
}

async function generateInsurerReport(data: InsurerReport) {
  const { insurer, clientName, sessionDate, therapistLicense, diagnosis, sessionNotes } = data;

  // Each insurer has different format requirements
  switch (insurer) {
    case HealthInsurer.CLALIT:
      return generateClalitReport(data);
    case HealthInsurer.MACCABI:
      return generateMaccabiReport(data);
    case HealthInsurer.MEUHEDET:
      return generateMeuhedetReport(data);
    case HealthInsurer.LEUMIT:
      return generateLeumitReport(data);
    default:
      throw new Error("Invalid insurer");
  }
}

function generateClalitReport(data: InsurerReport) {
  // Clalit specific format
  return {
    format: "CLALIT_XML",
    data: {
      therapistLicense: data.therapistLicense,
      patientName: data.clientName,
      treatmentDate: format(data.sessionDate, "yyyy-MM-dd"),
      treatmentType: mapSessionType(data.sessionType),
      diagnosis: data.diagnosis,
      treatmentSummary: data.sessionNotes,
    },
  };
}

function generateMaccabiReport(data: InsurerReport) {
  // Maccabi specific format
  return {
    format: "MACCABI_JSON",
    data: {
      provider_id: data.therapistLicense,
      patient_name: data.clientName,
      session_date: format(data.sessionDate, "dd/MM/yyyy"),
      session_type: data.sessionType,
      diagnosis_code: data.diagnosis,
      notes: data.sessionNotes,
    },
  };
}

function generateMeuhedetReport(data: InsurerReport) {
  // Meuhedet specific format
  return {
    format: "MEUHEDET_CSV",
    data: {
      license_number: data.therapistLicense,
      client_full_name: data.clientName,
      treatment_date: format(data.sessionDate, "dd/MM/yyyy"),
      treatment_code: data.sessionType,
      medical_diagnosis: data.diagnosis,
      session_notes: data.sessionNotes,
    },
  };
}

function generateLeumitReport(data: InsurerReport) {
  // Leumit specific format
  return {
    format: "LEUMIT_XML",
    data: {
      doctorId: data.therapistLicense,
      patientDetails: data.clientName,
      visitDate: format(data.sessionDate, "yyyyMMdd"),
      procedureCode: data.sessionType,
      clinicalNotes: data.sessionNotes,
    },
  };
}

function mapSessionType(type: string): string {
  const mapping: Record<string, string> = {
    IN_PERSON: "901", // Psychotherapy in-person
    ONLINE: "902",    // Psychotherapy online
    PHONE: "903",     // Psychotherapy phone
    BREAK: "000",     // Not billable
  };
  return mapping[type] || "901";
}

function getInsurerName(insurer: string): string {
  const names: Record<string, string> = {
    CLALIT: "כללית",
    MACCABI: "מכבי",
    MEUHEDET: "מאוחדת",
    LEUMIT: "לאומית",
  };
  return names[insurer] || insurer;
}
