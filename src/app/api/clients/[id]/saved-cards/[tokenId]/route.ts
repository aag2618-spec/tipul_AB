// src/app/api/clients/[id]/saved-cards/[tokenId]/route.ts
// USER-tenant — מחיקה רכה (soft-delete) של כרטיס שמור (Cardcom token).
//
// Soft-delete בלבד:
//   • שומרים את הרשומה ל-foreign keys היסטוריים (CardcomTransaction.savedCardTokenId)
//     וכדי שניתן יהיה לחקור chargebacks על עסקאות עבר.
//   • isActive=false + deletedAt=now ⇒ ה-GET לא מציג, ו-charge-saved-token חוסם.
//
// אין צורך לפנות ל-Cardcom — הטוקן עצמו נשאר בצד שלהם, פשוט לא נשתמש בו יותר.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  const { id: clientId, tokenId } = await context.params;

  // Ownership check on Client first — מחזיר 403 ברור (לא 404) אם הלקוח שייך
  // למטפל אחר, כדי לא לדלוף קיום לקוחות לאחרים.
  let client;
  try {
    client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, therapistId: true },
    });
  } catch (dbErr) {
    logger.error("[clients/saved-cards] DELETE client lookup failed", {
      clientId,
      tokenId,
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    return NextResponse.json({ message: "שגיאה בטעינת לקוח" }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ message: "לקוח לא נמצא" }, { status: 404 });
  }
  if (client.therapistId !== userId) {
    return NextResponse.json({ message: "אין הרשאה ללקוח זה" }, { status: 403 });
  }

  // ⚠️ אבטחה: כל האימותים יחד — tenant=USER, userId, clientId. אסור להסתמך
  // רק על tokenId כי שני מטפלים שונים יכלו (עקרונית) להגיע ל-id.
  let token;
  try {
    token = await prisma.savedCardToken.findUnique({
      where: { id: tokenId },
      select: {
        id: true,
        tenant: true,
        userId: true,
        clientId: true,
        isActive: true,
        deletedAt: true,
        cardLast4: true,
      },
    });
  } catch (dbErr) {
    logger.error("[clients/saved-cards] DELETE token lookup failed", {
      clientId,
      tokenId,
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    return NextResponse.json({ message: "שגיאה בטעינת כרטיס" }, { status: 500 });
  }
  if (
    !token ||
    token.tenant !== "USER" ||
    token.userId !== userId ||
    token.clientId !== clientId
  ) {
    // החזרה אחידה גם כשהטוקן באמת לא קיים וגם כשבעלות לא תואמת — לא לדלוף קיום.
    return NextResponse.json({ message: "כרטיס שמור לא נמצא" }, { status: 404 });
  }

  if (!token.isActive || token.deletedAt) {
    // אידמפוטנטי — אם כבר בוטל, נחזיר 200 ידידותי.
    return NextResponse.json({ success: true, alreadyDeleted: true });
  }

  try {
    await withAudit(
      { kind: "user", session },
      {
        action: "cardcom_user_delete_saved_card",
        targetType: "saved_card_token",
        targetId: token.id,
        details: {
          clientId,
          last4: token.cardLast4,
        },
      },
      async (tx) => {
        await tx.savedCardToken.update({
          where: { id: token.id },
          data: { isActive: false, deletedAt: new Date() },
        });
      }
    );
  } catch (err) {
    logger.error("[clients/saved-cards] DELETE soft-delete failed", {
      userId,
      clientId,
      tokenId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה במחיקת הכרטיס" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
