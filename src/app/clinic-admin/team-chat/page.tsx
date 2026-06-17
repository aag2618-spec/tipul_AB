import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { TeamChatView } from "@/components/chat/team-chat-view";
import { MessagesSquare, Users } from "lucide-react";

export const dynamic = "force-dynamic";

// צ׳אט צוות *בתוך* לייאאוט ניהול הקליניקה. מקביל ל-/dashboard/team-chat אבל
// נשאר בהקשר הקליניקה (אותו רכיב TeamChatView, אותם נתיבי /api/chat) — כך
// מנהל/ת או מזכיר/ה שנמצא/ת באזור הקליניקה לא "נזרק/ת" החוצה לדשבורד המטפל.
// בדיקת ההרשאה זהה לדף הדשבורד (defense in depth — הלייאאוט הוא client).
export default async function ClinicTeamChatPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      organizationId: true,
      clinicRole: true,
      role: true,
      isBlocked: true,
    },
  });

  const isMember =
    !!user?.organizationId &&
    !user.isBlocked &&
    (user.clinicRole === "OWNER" ||
      user.clinicRole === "SECRETARY" ||
      user.clinicRole === "THERAPIST" ||
      user.role === "CLINIC_OWNER" ||
      user.role === "CLINIC_SECRETARY");

  if (!isMember) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center space-y-3">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        <h1 className="text-xl font-semibold">צ׳אט צוות</h1>
        <p className="text-muted-foreground">
          צ׳אט הצוות זמין לחברי קליניקה (מנהלת, מזכירות ומטפלים). כשתצטרף/י
          לקליניקה, תוכלו לתקשר כאן באופן פנימי ומאובטח.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <MessagesSquare className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">צ׳אט צוות</h1>
          <p className="text-sm text-muted-foreground">
            תקשורת פנימית ומאובטחת בין חברי הקליניקה.
          </p>
        </div>
      </div>
      <TeamChatView currentUserId={session.user.id} />
    </div>
  );
}
