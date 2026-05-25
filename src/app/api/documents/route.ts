import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import storage from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { validateFileBuffer, safeExtensionForMime, stripImageMetadata, getCategoryMaxSize } from "@/lib/file-validation";
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
    let fileBuffer: Buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateFileBuffer(fileBuffer, file.type, "document");
    if (!validation.ok) {
      return NextResponse.json({ message: validation.error }, { status: 400 });
    }

    // H5 (2026-05-17): EXIF stripping — מסיר GPS/מטא-דאטה מתמונות (JPG/PNG).
    // PDF/Word לא נוגעים בהם. תמונה שעוברת אותה ביד מוסרים שכבת PHI.
    const originalSize = fileBuffer.length;
    fileBuffer = await stripImageMetadata(fileBuffer, file.type);

    // סבב 8 (2026-05-18): re-check size אחרי sharp. ה-output יכול תיאורטית
    // להיות גדול מ-input (PNG עם compressionLevel 9, או JPEG quality 95 על
    // קובץ לא דחוס). בלי ה-check, התוקף יכול לעקוף את maxSizeBytes ע"י
    // העלאת תמונה קטנה שמתפיחה אחרי decompress.
    if (fileBuffer.length > getCategoryMaxSize("document")) {
      // M10.5: תיעוד ניסיונות לעקוף maxSize דרך sharp expansion. עוזר לזהות
      // ניסיונות זדוניים (PNG bomb / נסיון מסודר) או lib regression.
      logger.warn("[upload] size exceeded after strip", {
        userId,
        filename: file.name,
        mime: file.type,
        originalSize,
        newSize: fileBuffer.length,
        limit: getCategoryMaxSize("document"),
        endpoint: "documents",
      });
      return NextResponse.json(
        { message: "הקובץ גדל מעבר לגבול אחרי ניקוי metadata" },
        { status: 400 }
      );
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

    await storage.write(`documents/${fileName}`, fileBuffer, file.type);

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
