import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DayAgendaView } from "@/components/agenda/day-agenda-view";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return <DayAgendaView />;
}
