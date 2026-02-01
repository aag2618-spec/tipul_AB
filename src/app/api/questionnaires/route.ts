import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Get all questionnaire templates
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await prisma.questionnaireTemplate.findMany({
      orderBy: [
        { category: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Error fetching questionnaire templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch questionnaire templates" },
      { status: 500 }
    );
  }
}
