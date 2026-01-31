import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST - שמור תשובות לשאלון
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { clientId, templateId, responses } = body;

    // בדוק שהלקוח שייך למטפל
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

      // שמור את התשובות
      const response = await prisma.intakeResponse.create({
        data: {
          clientId,
          templateId,
          responses,
        },
        include: {
          template: true,
        },
      });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error saving questionnaire response:", error);
    return NextResponse.json(
      { error: "Failed to save response" },
      { status: 500 }
    );
  }
}

// GET - קבל תשובות של לקוח
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 });
    }

    // בדוק שהלקוח שייך למטפל
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

      const responses = await prisma.intakeResponse.findMany({
        where: { clientId },
        include: {
          template: true,
        },
        orderBy: {
          filledAt: "desc",
        },
      });

    return NextResponse.json(responses);
  } catch (error) {
    console.error("Error fetching questionnaire responses:", error);
    return NextResponse.json(
      { error: "Failed to fetch responses" },
      { status: 500 }
    );
  }
}
