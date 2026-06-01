import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { TeamChatView } from "@/components/chat/team-chat-view";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TeamChatPage() {
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
          צ׳אט הצוות זמין לקליניקות עם מנהלת ומזכירות. כשתצרף/י אנשי צוות
          לקליניקה, תוכלו לתקשר כאן באופן פנימי ומאובטח.
        </p>
      </div>
    );
  }

  return (
    <div>
      <TeamChatView currentUserId={session.user.id} />
    </div>
  );
}
