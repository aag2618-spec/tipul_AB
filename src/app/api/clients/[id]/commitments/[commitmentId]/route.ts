import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { parseBody } from "@/lib/validations/helpers";
import { updateCommitmentSchema } from "@/lib/validations/client";
import { loadScopeUser, buildClientWhere, isSecretary, secretaryCan } from "@/lib/scope";
import { logDataAccess } from "@/lib/audit-logger";
import { CommitmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

async function verifyAccess(userId: string, clientId: string, commitmentId: string) {
  const scopeUser = await loadScopeUser(userId);
  const client = await prisma.client.findFirst({
    where: { AND: [{ id: clientId }, buildClientWhere(scopeUser)] },
    select: { id: true },
  });
  if (!client) return { error: "מטופל לא נמצא", status: 404, scopeUser };

  const commitment = await prisma.clientCommitment.findFirst({
    where: { id: commitmentId, clientId },
  });
  if (!commitment) return { error: "התחייבות לא נמצאה", status: 404, scopeUser };

  return { commitment, scopeUser };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; commitmentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: clientId, commitmentId } = await context.params;

  try {
    const result = await verifyAccess(userId, clientId, commitmentId);
    if ("error" in result) {
      return NextResponse.json({ message: result.error }, { status: result.status });
    }

    return NextResponse.json(serializePrisma(result.commitment));
  } catch (error) {
    logger.error("Get commitment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההתחייבות" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; commitmentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: clientId, commitmentId } = await context.params;

  try {
    const result = await verifyAccess(userId, clientId, commitmentId);
    if ("error" in result) {
      return NextResponse.json({ message: result.error }, { status: result.status });
    }

    if (isSecretary(result.scopeUser) && !secretaryCan(result.scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה לעדכון התחייבות" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, updateCommitmentSchema);
    if ("error" in parsed) return parsed.error;

    const {
      commitmentNumber, form17Number, referringDoctor,
      referralDate, approvedSessions, usedSessions, copaymentAmount,
      startDate, endDate, status, notes,
    } = parsed.data;

    const updateData = {
      ...(commitmentNumber !== undefined ? { commitmentNumber: commitmentNumber || null } : {}),
      ...(form17Number !== undefined ? { form17Number: form17Number || null } : {}),
      ...(referringDoctor !== undefined ? { referringDoctor: referringDoctor || null } : {}),
      ...(referralDate !== undefined ? { referralDate: referralDate ? new Date(referralDate) : null } : {}),
      ...(approvedSessions !== undefined ? { approvedSessions: approvedSessions ?? null } : {}),
      ...(usedSessions !== undefined ? { usedSessions } : {}),
      ...(copaymentAmount !== undefined ? { copaymentAmount: copaymentAmount ?? null } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(status !== undefined ? { status: status as CommitmentStatus } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
    };

    const updated = await prisma.clientCommitment.updateMany({
      where: { id: commitmentId, clientId },
      data: updateData,
    });

    if (updated.count === 0) {
      return NextResponse.json({ message: "התחייבות לא נמצאה" }, { status: 404 });
    }

    logDataAccess({
      userId,
      recordType: "CLIENT_COMMITMENT",
      recordId: commitmentId,
      action: "UPDATE",
      clientId,
      request,
    });

    const refreshed = await prisma.clientCommitment.findUnique({ where: { id: commitmentId } });
    return NextResponse.json(serializePrisma(refreshed));
  } catch (error) {
    logger.error("Update commitment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההתחייבות" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; commitmentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: clientId, commitmentId } = await context.params;

  try {
    const result = await verifyAccess(userId, clientId, commitmentId);
    if ("error" in result) {
      return NextResponse.json({ message: result.error }, { status: result.status });
    }

    if (isSecretary(result.scopeUser) && !secretaryCan(result.scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה למחיקת התחייבות" },
        { status: 403 }
      );
    }

    await prisma.clientCommitment.deleteMany({ where: { id: commitmentId, clientId } });

    logDataAccess({
      userId,
      recordType: "CLIENT_COMMITMENT",
      recordId: commitmentId,
      action: "DELETE",
      clientId,
      request,
    });

    return NextResponse.json({ message: "ההתחייבות נמחקה בהצלחה" });
  } catch (error) {
    logger.error("Delete commitment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת ההתחייבות" },
      { status: 500 }
    );
  }
}
