import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/cancellation-requests
// Get all cancellation requests for the therapist
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const countOnly = searchParams.get("countOnly") === "true";

    // Build where clause - get requests for sessions that belong to this thexxxxxx
    const where: Record<string, unknown> = {
      session: {
        therapistId: session.user.id,
      },
    };

    if (status) {
      where.status = status;
    }

    // If only counting, return count
    if (countOnly) {
      const count = await prisma.cancellationRequest.count({ where });
      return NextResponse.json({ count });
    }

    const requests = await prisma.cancellationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        session: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
            type: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate hours until session for each request
    const enrichedRequests = requests.map((req) => {
      const hoursUntilSession = 
        (new Date(req.session.startTime).getTime() - Date.now()) / (1000 * 60 * 60);
      
      return {
        id: req.id,
        sessionId: req.session.id,
        clientId: req.client.id,
        clientName: req.client.name,
        clientEmail: req.client.email,
        clientPhone: req.client.phone,
        sessionDate: req.session.startTime,
        sessionEndTime: req.session.endTime,
        sessionType: req.session.type,
        sessionStatus: req.session.status,
        reason: req.reason,
        status: req.status,
        adminNotes: req.adminNotes,
        requestedAt: req.createdAt,
        reviewedAt: req.reviewedAt,
        reviewedBy: req.reviewedBy?.name,
        hoursUntilSession: Math.round(hoursUntilSession * 10) / 10,
        isUrgent: hoursUntilSession < 24 && hoursUntilSession > 0,
      };
    });

    return NextResponse.json({
      requests: enrichedRequests,
      total: enrichedRequests.length,
    });
  } catch (error) {
    console.error("Get cancellation requests error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת בקשות הביטול" },
      { status: 500 }
    );
  }
}
