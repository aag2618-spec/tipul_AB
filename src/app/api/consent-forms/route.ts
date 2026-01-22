import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const isTemplate = searchParams.get("isTemplate") === "true";

    const where: any = { therapistId: session.user.id };
    if (clientId) {
      where.clientId = clientId;
    }
    if (isTemplate !== undefined) {
      where.isTemplate = isTemplate;
    }

    const forms = await prisma.consentForm.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(forms);
  } catch (error) {
    console.error("Get consent forms error:", error);
    return NextResponse.json(
      { error: "שגיאה בטעינת הטפסים" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { type, title, content, isTemplate, clientId } = body;

    const form = await prisma.consentForm.create({
      data: {
        type,
        title,
        content,
        isTemplate,
        clientId: clientId || null,
        therapistId: session.user.id,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(form);
  } catch (error) {
    console.error("Create consent form error:", error);
    return NextResponse.json(
      { error: "שגיאה ביצירת הטופס" },
      { status: 500 }
    );
  }
}
