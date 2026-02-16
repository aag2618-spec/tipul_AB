import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.communicationLog.updateMany({
      where: {
        id,
        userId: session.user.id,
        status: "FAILED",
      },
      data: {
        status: "DISMISSED",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dismiss failed message error:", error);
    return NextResponse.json(
      { message: "שגיאה" },
      { status: 500 }
    );
  }
}
