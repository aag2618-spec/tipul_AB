import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateSessionSummary } from "@/lib/google-ai";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { transcription } = body;

    if (!transcription) {
      return NextResponse.json(
        { message: "נא לספק תמלול" },
        { status: 400 }
      );
    }

    const summary = await generateSessionSummary(transcription);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Generate summary error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הסיכום" },
      { status: 500 }
    );
  }
}













