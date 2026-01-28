import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const { status } = await req.json();

    // Validate status
    const validStatuses = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Verify the session belongs to this therapist
    const therapySession = await prisma.therapySession.findFirst({
      where: {
        id: sessionId,
        client: {
          therapistId: session.user.id,
        },
      },
    });

    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Update the session status
    const updatedSession = await prisma.therapySession.update({
      where: { id: sessionId },
      data: { status },
    });

    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error("Error updating session status:", error);
    return NextResponse.json(
      { error: "Failed to update session status" },
      { status: 500 }
    );
  }
}
