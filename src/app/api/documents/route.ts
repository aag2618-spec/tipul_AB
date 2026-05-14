import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { validateFileBuffer, safeExtensionForMime } from "@/lib/file-validation";
import { documentFormFieldsSchema } from "@/lib/validations/document";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const scopeUser = await loadScopeUser(userId);
    const clientWhere = buildClientWhere(scopeUser);

    // Documents may be linked to a Client (visible via clientWhere) or be
    // "general" docs without a client — for the latter fall back to
    // therapistId/organizationId ownership so clinic owners still see them.
    const ownershipFilter = scopeUser.organizationId
      ? { organizationId: scopeUser.organizationId }
      : { therapistId: userId };

    const documents = await prisma.document.findMany({
      where: {
        AND: [
          {
            OR: [
              { client: clientWhere },
              { AND: [{ clientId: null }, ownershipFilter] },
            ],
          },
          ...(clientId ? [{ clientId }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(documents);
  } catch (error) {
    logger.error("Get documents error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המסמכים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ message: "נא לספק קובץ" }, { status: 400 });
    }

    // H12: validation של השדות הטקסטואליים דרך zod (formData ⇒ object).
    const fieldsRaw = {
      name: formData.get("name"),
      type: formData.get("type"),
      clientId: formData.get("clientId") ?? undefined,
    };
    const fieldsParsed = documentFormFieldsSchema.safeParse(fieldsRaw);
    if (!fieldsParsed.success) {
      const fieldErrors = fieldsParsed.error.flatten().fieldErrors;
      const firstMessage =
        Object.values(fieldErrors).flat().filter(Boolean)[0] ||
        "נתונים לא תקינים";
      return NextResponse.json(
        { message: firstMessage, errors: fieldErrors },
        { status: 400 }
      );
    }
    const { name, type, clientId } = fieldsParsed.data;

    // H5: validate size + MIME + magic-bytes לפני שמירה לדיסק.
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const validation = validateFileBuffer(fileBuffer, file.type, "document");
    if (!validation.ok) {
      return NextResponse.json({ message: validation.error }, { status: 400 });
    }

    const scopeUser = await loadScopeUser(userId);
    const clientWhere = buildClientWhere(scopeUser);

    // Verify client ownership if provided
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, clientWhere] },
      });
      if (!client) {
        return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
      }
    }

    // H10: extension נקבע לפי ה-MIME שאומת ע"י validateFileBuffer (magic bytes)
    // ולא לפי file.name של המשתמש. מונע "trap.html עם תוכן PDF" שיוגש כ-HTML.
    const fileExtension = safeExtensionForMime(file.type);
    const fileName = `${uuidv4()}.${fileExtension}`;

    // Use persistent disk on Render, fallback to local for development
    const baseDir = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
    const uploadsDir = join(baseDir, "documents");

    await mkdir(uploadsDir, { recursive: true });

    const filePath = join(uploadsDir, fileName);
    await writeFile(filePath, fileBuffer);

    // Create document record
    const document = await prisma.document.create({
      data: {
        therapistId: userId,
        clientId: clientId || null,
        organizationId: scopeUser.organizationId,
        name,
        type,
        fileUrl: `/api/uploads/documents/${fileName}`,
        signed: false,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    logger.error("Create document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בהעלאת המסמך" },
      { status: 500 }
    );
  }
}
