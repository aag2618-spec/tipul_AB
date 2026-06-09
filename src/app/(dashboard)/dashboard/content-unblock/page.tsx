import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ContentUnblockTool } from "@/components/content-unblock/content-unblock-tool";

export const dynamic = "force-dynamic";

// "שחרור תיק חסום" — דף שרת דק. שער: רק למשתמש/ת שהדליק/ה את הטוגל
// (usesContentFilter) ושאינו/ה מזכיר/ה. אחרת notFound — הסתרת הקישור בסרגל
// היא UX בלבד; זו ההגנה האמיתית בצד שרת. הדף עצמו לא טוען שום תוכן קליני.
export default async function ContentUnblockPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { usesContentFilter: true, role: true, clinicRole: true },
  });

  if (!user?.usesContentFilter) notFound();

  const isSecretaryUser =
    user.clinicRole === "SECRETARY" || user.role === "CLINIC_SECRETARY";
  if (isSecretaryUser) notFound();

  return <ContentUnblockTool />;
}
