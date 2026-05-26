import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { parseBody } from "@/lib/validations/helpers";
import { createCommitmentSchema } from "@/lib/validations/client";
import { loadScopeUser, buildClientWhere, isSecretary, secretaryCan } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: clientId } = await context.params;

  try {
    const scopeUser = await loadScopeUser(userId);
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, buildClientWhere(scopeUser)] },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    const commitments = await prisma.clientCommitment.findMany({
      where: { clientId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(serializePrisma(commitments));
  } catch (error) {
    logger.error("Get commitments error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההתחייבויות" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: clientId } = await context.params;

  try {
    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה ליצירת התחייבות" },
        { status: 403 }
      );
    }

    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, buildClientWhere(scopeUser)] },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    const parsed = await parseBody(request, createCommitmentSchema);
    if ("error" in parsed) return parsed.error;

    const {
      commitmentNumber, form17Number, referringDoctor,
      referralDate, approvedSessions, copaymentAmount,
      startDate, endDate, notes,
    } = parsed.data;

    const commitment = await prisma.clientCommitment.create({
      data: {
        clientId,
        therapistId: userId,
        commitmentNumber: commitmentNumber || null,
        form17Number: form17Number || null,
        referringDoctor: referringDoctor || null,
        referralDate: referralDate ? new Date(referralDate) : null,
        approvedSessions: approvedSessions ?? null,
        copaymentAmount: copaymentAmount ?? null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json(serializePrisma(commitment), { status: 201 });
  } catch (error) {
    logger.error("Create commitment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת ההתחייבות" },
      { status: 500 }
    );
  }
}
