import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { WaitlistView } from "@/components/waitlist/waitlist-view";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return <WaitlistView />;
}
