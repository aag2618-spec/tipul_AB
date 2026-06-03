import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import {
  getChatMembers,
  chatRoleLabel,
  getOrgChatSettings,
  memberKind,
  canPairChat,
} from "@/lib/chat/chat-service";

export const dynamic = "force-dynamic";

// GET /api/chat/contacts — אנשי הצוות שאפשר לפתוח איתם שיחה, לא כולל את המשתמש
// עצמו. הנהלה (מנהלת/מזכירה) רואה את כולם; מטפל רואה את ההנהלה תמיד, ומטפלים
// אחרים רק אם המנהלת הפעילה allowTherapistChat (canPairChat).
export async function GET() {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId, isOwner, isSecretary } = auth;

    const viewerKind = isOwner || isSecretary ? "MANAGEMENT" : "THERAPIST";
    const { allowTherapistChat } = await getOrgChatSettings(organizationId);

    const members = await getChatMembers(organizationId);
    const contacts = members
      .filter((m) => m.id !== userId)
      .filter((m) =>
        canPairChat(
          viewerKind,
          memberKind(m.clinicRole, m.role),
          allowTherapistChat
        )
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        role: chatRoleLabel(m.clinicRole, m.role),
      }));

    return NextResponse.json({ contacts });
  } catch (error) {
    logger.error("[Chat] Get contacts error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת אנשי הקשר" },
      { status: 500 }
    );
  }
}
