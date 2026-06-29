import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { logDataAccess } from "@/lib/audit-logger";
import { loadScopeUser, buildDocumentWhere } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import storage from "@/lib/storage";
import { parseBody } from "@/lib/validations/helpers";
import { updateDocumentSchema } from "@/lib/validations/document";

// C6: ממיר fileUrl שמור ב-DB ל-relative path בתוך UPLOADS_DIR.
// פורמטים מותרים: "/api/uploads/<rel>" או "/uploads/<rel>". כל אחר נדחה
// כדי למנוע path-traversal דרך רשומת DB מזויפת. storage.delete מאמת
// בנוסף שה-resolve מסתיים בתוך baseDir.
function fileUrlToRelative(fileUrl: string | null | undefined): string | null {
  if (!fileUrl || typeof fileUrl !== "string") return null;
  const prefixes = ["/api/uploads/", "/uploads/"];
  for (const p of prefixes) {
    if (fileUrl.startsWith(p)) {
      const rel = fileUrl.slice(p.length);
      // חסימת תווי traversal בסיסיים (defense-in-depth מעבר ל-storage)
      if (rel.includes("..") || rel.startsWith("/") || rel.startsWith("\\")) {
        return null;
      }
      return rel;
    }
  }
  return null;
}

export const dynamic = "force-dynamic";

// B5: בעלות על Document נשלפת מ-scope.ts (buildDocumentWhere). כך THERAPIST
// בקליניקה רואה רק את הטמפלייטים שלו ולא של קולגות, וההיגיון מרוכז במקום אחד.
async function buildDocumentOwnershipWhere(userId: string) {
  const scopeUser = await loadScopeUserWithMode(userId);
  return {
    scopeUser,
    where: buildDocumentWhere(scopeUser),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const { where: ownershipWhere } = await buildDocumentOwnershipWhere(userId);

    const document = await prisma.document.findFirst({
      where: { AND: [{ id }, ownershipWhere] },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (error) {
    logger.error("Get document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המסמך" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const parsed = await parseBody(request, updateDocumentSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    const { where: ownershipWhere } = await buildDocumentOwnershipWhere(userId);

    const existing = await prisma.document.findFirst({
      where: { AND: [{ id }, ownershipWhere] },
    });

    if (!existing) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    // Atomic update with ownership check ב-WHERE — מונע race condition
    const updateResult = await prisma.document.updateMany({
      where: { AND: [{ id }, ownershipWhere] },
      data: {
        name: body.name ?? existing.name,
        type: body.type ?? existing.type,
        signed: body.signed ?? existing.signed,
        signedAt: body.signed && !existing.signed ? new Date() : existing.signedAt,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    const document = await prisma.document.findUnique({ where: { id } });
    return NextResponse.json(document);
  } catch (error) {
    logger.error("Update document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון המסמך" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

    const { id } = await params;

    const { where: ownershipWhere } = await buildDocumentOwnershipWhere(userId);

    const document = await prisma.document.findFirst({
      where: { AND: [{ id }, ownershipWhere] },
    });

    if (!document) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    // Atomic delete — ownership ב-WHERE מונע race condition
    const deleteResult = await prisma.document.deleteMany({
      where: { AND: [{ id }, ownershipWhere] },
    });

    if (deleteResult.count === 0) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    // Delete file (after DB delete succeeded) — C6: דרך storage.delete
    // עם validation של path traversal. אם fileUrl לא בפורמט מצופה (לדוגמה
    // legacy/manual edit ב-DB) — לא ננסה למחוק, רק נרשום warning.
    const relPath = fileUrlToRelative(document.fileUrl);
    if (relPath) {
      try {
        await storage.delete(relPath);
      } catch (err) {
        // File might not exist on disk — לא חוסם את המחיקה הלוגית.
        logger.warn("[documents] file delete failed", {
          documentId: id,
          relPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      logger.warn("[documents] unexpected fileUrl format, skipping file delete", {
        documentId: id,
      });
    }

    // Audit log — פעולה הרסנית על מסמך רפואי
    logDataAccess({
      userId,
      recordType: "DOCUMENT",
      recordId: id,
      action: "DELETE",
      clientId: document.clientId,
      request,
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    return NextResponse.json({ message: "המסמך נמחק בהצלחה" });
  } catch (error) {
    logger.error("Delete document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המסמך" },
      { status: 500 }
    );
  }
}






