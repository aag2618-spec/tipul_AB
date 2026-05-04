import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { buildSessionWhere, loadScopeUser } from "@/lib/scope";
import type { Prisma } from "@prisma/client";

// GET /api/cancellation-requests
// Get all cancellation requests for the therapist
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const countOnly = searchParams.get("countOnly") === "true";

    const scopeUser = await loadScopeUser(userId);
    const sessionWhere = buildSessionWhere(scopeUser);

    // Build where clause — בקשות ביטול נגישות אם הפגישה הקשורה נגישה למשתמש
    // לפי scope (סולו/קליניקה/מזכירה).
    const where: Prisma.CancellationRequestWhereInput = {
      session: sessionWhere,
    };

    if (status) {
      // שמירה על הסמנטיקה הקיימת (אין ולידציה — מועבר כמו שהוא ל-Prisma).
      where.status = status as Prisma.CancellationRequestWhereInput["status"];
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
    logger.error("Get cancellation requests error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת בקשות הביטול" },
      { status: 500 }
    );
  }
}
