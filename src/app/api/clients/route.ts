import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseBody } from "@/lib/validations/helpers";
import { createClientSchema } from "@/lib/validations/client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { therapistId: userId };

    if (status) {
      where.status = status;
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { lastName: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        defaultSessionPrice: true,
        createdAt: true,
        _count: {
          select: {
            therapySessions: true,
          },
        },
      },
    });

    // Convert Decimal to number for JSON serialization
    const clientsWithPriceAsNumber = clients.map(client => ({
      ...client,
      defaultSessionPrice: client.defaultSessionPrice ? Number(client.defaultSessionPrice) : null,
    }));

    return NextResponse.json(clientsWithPriceAsNumber);
  } catch (error) {
    logger.error("Get clients error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המטופלים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const parsed = await parseBody(request, createClientSchema);
    if ("error" in parsed) return parsed.error;
    const { firstName, lastName, phone, email, birthDate, address, notes, status, defaultSessionPrice } = parsed.data;

    const client = await prisma.client.create({
      data: {
        therapistId: userId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone || null,
        email: email || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        address: address || null,
        notes: notes || null,
        status: status || "ACTIVE",
        defaultSessionPrice: defaultSessionPrice ? parseFloat(String(defaultSessionPrice)) : null,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    logger.error("Create client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת המטופל" },
      { status: 500 }
    );
  }
}
