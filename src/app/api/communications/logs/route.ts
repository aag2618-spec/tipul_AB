import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    // Get all communication logs for this therapist
    const logs = await prisma.communicationLog.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200, // Limit to last 200 logs
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Get communication logs error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת לוג תקשורת" },
      { status: 500 }
    );
  }
}
