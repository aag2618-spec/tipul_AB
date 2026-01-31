import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - קבל תשובה ספציפית
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const response = await prisma.intakeResponse.findFirst({
      where: { id },
      include: {
        template: true,
        client: {
          where: {
            therapistId: session.user.id,
          },
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!response || !response.client) {
      return NextResponse.json({ error: "Response not found" }, { status: 404 });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching intake response:", error);
    return NextResponse.json(
      { error: "Failed to fetch response" },
      { status: 500 }
    );
  }
}
