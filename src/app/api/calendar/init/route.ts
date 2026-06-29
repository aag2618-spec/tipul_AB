import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, buildSessionWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { calculatePaidAmount } from "@/lib/payment-utils";
import { serializePrisma } from "@/lib/serialize";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const scopeUser = await loadScopeUserWithMode(userId);
    const scopeWhere = buildSessionWhere(scopeUser);
    const clientScopeWhere = buildClientWhere(scopeUser);

    const extraConditions: Prisma.TherapySessionWhereInput = {};
    if (startDate && endDate) {
      const rangeStart = parseIsraelTime(startDate);
      const rangeEnd = parseIsraelTime(endDate);
      extraConditions.AND = [
        { startTime: { lt: rangeEnd } },
        { endTime: { gt: rangeStart } },
      ];
    }

    const sessionWhere: Prisma.TherapySessionWhereInput = {
      AND: [scopeWhere, extraConditions],
    };

    const paymentInclude = {
      childPayments: {
        where: { status: "PAID" as const },
        select: { id: true, amount: true, status: true },
      },
    };
    const includeForRole = isSecretary(scopeUser)
      ? {
          client: { select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true } },
          payment: { include: paymentInclude },
        }
      : {
          client: { select: { id: true, name: true, email: true, phone: true, creditBalance: true, defaultSessionPrice: true, isQuickClient: true } },
          sessionNote: true,
          payment: { include: paymentInclude },
        };

    const [sessions, clients, patterns, profile] = await Promise.all([
      prisma.therapySession.findMany({
        where: sessionWhere,
        orderBy: { startTime: "asc" },
        include: includeForRole,
      }),

      prisma.client.findMany({
        where: { AND: [clientScopeWhere, {}] },
        orderBy: { lastName: "asc" },
        select: {
          id: true, firstName: true, lastName: true, name: true,
          email: true, phone: true, status: true,
          defaultSessionPrice: true, creditBalance: true, isQuickClient: true,
        },
      }),

      prisma.recurringPattern.findMany({
        where: { userId },
        include: { client: { select: { id: true, name: true } } },
        orderBy: [{ dayOfWeek: "asc" }, { time: "asc" }],
      }),

      prisma.user.findUnique({
        where: { id: userId },
        select: { defaultSessionDuration: true, defaultSessionPrice: true },
      }),
    ]);

    const enrichedSessions = sessions.map((s) => {
      if (!s.payment) return s;
      const p = s.payment;
      const paidAmount = calculatePaidAmount({
        amount: p.amount,
        status: p.status,
        method: p.method,
        hasReceipt: p.hasReceipt,
        childPayments: p.childPayments,
      });
      return { ...s, payment: { ...p, paidAmount } };
    });

    const clientsWithPrice = clients.map((c) => ({
      ...c,
      defaultSessionPrice: c.defaultSessionPrice ? Number(c.defaultSessionPrice) : null,
      creditBalance: c.creditBalance ? Number(c.creditBalance) : null,
    }));

    const safeSessions = isSecretary(scopeUser)
      ? enrichedSessions.map(({ notes, topic, ...rest }: Record<string, unknown>) => rest)
      : enrichedSessions;

    return NextResponse.json({
      sessions: serializePrisma(safeSessions),
      clients: clientsWithPrice,
      patterns,
      profile: {
        defaultSessionDuration: profile?.defaultSessionDuration || 50,
        defaultSessionPrice: profile?.defaultSessionPrice ? Number(profile.defaultSessionPrice) : null,
      },
    });
  } catch (error) {
    logger.error("Calendar init error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאה בטעינת היומן" }, { status: 500 });
  }
}
