import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: { id, therapistId: session.user.id },
      include: {
        therapySessions: {
          orderBy: { startTime: "desc" },
          take: 10,
          include: { sessionNote: true },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        recordings: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { transcription: { include: { analysis: true } } },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("Get client error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המטופל" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { firstName, lastName, phone, email, birthDate, address, notes, status, initialDiagnosis, intakeNotes, defaultSessionPrice } = body;

    // Verify ownership
    const existingClient = await prisma.client.findFirst({
      where: { id, therapistId: session.user.id },
    });

    if (!existingClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    const client = await prisma.client.update({
      where: { id },
      data: {
        firstName: firstName?.trim() || existingClient.firstName || "",
        lastName: lastName?.trim() || existingClient.lastName || "",
        name: (firstName && lastName) ? `${firstName.trim()} ${lastName.trim()}` : existingClient.name,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        address: address?.trim() || null,
        notes: notes !== undefined ? (notes?.trim() || null) : existingClient.notes,
        status: status || existingClient.status,
        defaultSessionPrice: defaultSessionPrice !== undefined ? (defaultSessionPrice !== null ? parseFloat(defaultSessionPrice) : null) : existingClient.defaultSessionPrice,
        initialDiagnosis: initialDiagnosis !== undefined ? (initialDiagnosis?.trim() || null) : existingClient.initialDiagnosis,
        intakeNotes: intakeNotes !== undefined ? (intakeNotes?.trim() || null) : existingClient.intakeNotes,
      },
    });

    return NextResponse.json(client);
  } catch (error) {
    console.error("Update client error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון המטופל" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const existingClient = await prisma.client.findFirst({
      where: { id, therapistId: session.user.id },
    });

    if (!existingClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    await prisma.client.delete({ where: { id } });

    return NextResponse.json({ message: "המטופל נמחק בהצלחה" });
  } catch (error) {
    console.error("Delete client error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המטופל" },
      { status: 500 }
    );
  }
}








