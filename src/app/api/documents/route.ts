import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const documents = await prisma.document.findMany({
      where: {
        therapistId: session.user.id,
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המסמכים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const clientId = formData.get("clientId") as string | null;

    if (!file || !name || !type) {
      return NextResponse.json(
        { message: "נא לספק קובץ, שם וסוג" },
        { status: 400 }
      );
    }

    // Verify client ownership if provided
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, therapistId: session.user.id },
      });
      if (!client) {
        return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
      }
    }

    // Save file
    const fileExtension = file.name.split(".").pop() || "pdf";
    const fileName = `${uuidv4()}.${fileExtension}`;
    
    // Use persistent disk on Render, fallback to local for development
    const baseDir = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
    const uploadsDir = join(baseDir, "documents");
    
    await mkdir(uploadsDir, { recursive: true });
    
    const filePath = join(uploadsDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Validate document type
    const validTypes = ["CONSENT_FORM", "INTAKE_FORM", "TREATMENT_PLAN", "REPORT", "OTHER"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { message: "סוג מסמך לא תקין" },
        { status: 400 }
      );
    }

    // Create document record
    const document = await prisma.document.create({
      data: {
        therapistId: session.user.id,
        clientId: clientId || null,
        name,
        type: type as "CONSENT_FORM" | "INTAKE_FORM" | "TREATMENT_PLAN" | "REPORT" | "OTHER",
        fileUrl: `/api/uploads/documents/${fileName}`,
        signed: false,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בהעלאת המסמך" },
      { status: 500 }
    );
  }
}

