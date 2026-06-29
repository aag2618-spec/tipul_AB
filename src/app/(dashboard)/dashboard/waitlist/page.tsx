import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isSecretary } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { getViewMode } from "@/lib/view-scope";
import { WaitlistView } from "@/components/waitlist/waitlist-view";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // תצוגת "שלי" אמיתית — בדיוק כמו ביומן (isOwnPersonalView): מטפל/ת (לא מזכירה)
  // הצופה בהיקף האישי. כאן זה מסתיר את בורר "מטפל מועדף" בדיאלוג ההוספה ואת שורת
  // המטפל בכרטיסים, כך שב"שלי" הרשימה מתנהגת כמו אצל מטפל/ת יחיד/ה. מזכירה אף פעם
  // אינה ב"שלי" → ממשיכה לראות את הבורר ואת כל הקליניקה.
  const scopeUser = await loadScopeUserWithMode(session.user.id);
  const isOwnPersonalView =
    !isSecretary(scopeUser) && (await getViewMode()) === "personal";

  return <WaitlistView isOwnPersonalView={isOwnPersonalView} />;
}
