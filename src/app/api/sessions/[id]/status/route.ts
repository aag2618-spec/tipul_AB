import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    const { status, cancellationReason } = await req.json();

    const validStatuses = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW", "PENDING_APPROVAL"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const therapySession = await prisma.therapySession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { therapistId: session.user.id },
          { client: { therapistId: session.user.id } },
        ],
      },
    });

    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "CANCELLED") {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = session.user.id;
      if (cancellationReason) updateData.cancellationReason = cancellationReason;
    }

    const updatedSession = await prisma.therapySession.update({
      where: { id: sessionId },
      data: updateData,
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
