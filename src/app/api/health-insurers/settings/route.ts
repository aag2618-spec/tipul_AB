import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const settings = await prisma.insurerSettings.findUnique({
      where: { therapistId: session.user.id },
    });

    // Return defaults if no settings exist
    if (!settings) {
      return NextResponse.json({
        enabled: false,
        clalit: { enabled: false, apiKey: "", facilityId: "" },
        maccabi: { enabled: false, apiKey: "", providerId: "" },
        meuhedet: { enabled: false, username: "", password: "" },
        leumit: { enabled: false, apiKey: "", clinicCode: "" },
        autoSubmit: false,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Get insurer settings error:", error);
    return NextResponse.json(
      { error: "שגיאה בטעינת הגדרות" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();

    const settings = await prisma.insurerSettings.upsert({
      where: { therapistId: session.user.id },
      create: {
        therapistId: session.user.id,
        ...body,
      },
      update: body,
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Update insurer settings error:", error);
    return NextResponse.json(
      { error: "שגיאה בשמירת הגדרות" },
      { status: 500 }
    );
  }
}
