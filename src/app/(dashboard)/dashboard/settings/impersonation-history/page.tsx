import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

// היסטוריית התחזויות שבוצעו כנגד המשתמש (target).
// המטפל/ת/מזכיר/ה רואה/ה מי נכנס/ה לחשבון שלו/ה ומתי, לצורך שקיפות.
// אין צורך בבדיקת clinic-role — כל user רואה רק את ההתחזויות כנגדו.
export default async function ImpersonationHistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  // משתמשים ב-originalUserId כדי שהעמוד יראה תמיד את ההיסטוריה של ה-OWNER
  // האמיתי גם בעת impersonation. אם נשתמש ב-session.user.id (שהוא target
  // בעת impersonation), ה-OWNER יראה את היסטוריית ההתחזויות **כנגד ה-target**
  // ולא נגדו עצמו — מבלבל ולא רצוי. originalUserId נופל ל-id רגיל כשאין
  // impersonation, אז ההתנהגות זהה למשתמש רגיל.
  const userId = session.user.originalUserId ?? session.user.id;
  const isImpersonating = !!session.user.actingAs;

  const records = await prisma.impersonationSession.findMany({
    where: { targetUserId: userId },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      impersonatorNameSnapshot: true,
      reason: true,
      startedAt: true,
      endedAt: true,
      endedReason: true,
      ipAddress: true,
    },
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <ShieldAlert className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">היסטוריית התחזויות</h1>
          <p className="text-sm text-muted-foreground">
            רשימת הפעמים שבעל/ת הקליניקה נכנס/ה לחשבון שלך לצורך ביקורת.
          </p>
        </div>
      </div>

      {isImpersonating && (
        <div
          className="bg-amber-500/10 border border-amber-500/40 rounded-md p-3 text-sm text-amber-700 dark:text-amber-300"
          role="note"
        >
          את/ה כעת במצב התחזות — העמוד הזה מציג את ההיסטוריה של החשבון
          האמיתי שלך, לא של החבר/ה שאת/ה מתחזה לו/ה.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            {records.length === 0 ? "אין רישומי כניסה" : `${records.length} רשומות אחרונות`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              לא נרשמו עד כה כניסות של בעל/ת קליניקה לחשבון שלך.
            </p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => {
                const start = new Date(r.startedAt);
                const end = r.endedAt ? new Date(r.endedAt) : null;
                const durationMs = end ? end.getTime() - start.getTime() : null;
                // תצוגה עברית עם pluralization נכון: יחיד "שנייה אחת"/"דקה אחת"
                // לא "1 שניות" שגוי דקדוקית. סשנים קצרים (< 60s) בשניות כדי שלא
                // יראו "0 דקות" מטעה. סשנים ארוכים בדקות. בעת סשן פעיל — תווית מיוחדת.
                const durationLabel = (() => {
                  if (durationMs === null) return "פעיל כעת";
                  if (durationMs < 60_000) {
                    const seconds = Math.max(1, Math.round(durationMs / 1000));
                    return seconds === 1 ? "שנייה אחת" : `${seconds} שניות`;
                  }
                  const minutes = Math.round(durationMs / 1000 / 60);
                  return minutes === 1 ? "דקה אחת" : `${minutes} דקות`;
                })();

                const endReasonLabel = (() => {
                  if (!r.endedReason) return null;
                  switch (r.endedReason) {
                    case "MANUAL":
                      return "הסתיים ידנית";
                    case "TIMEOUT_4H":
                      return "הסתיים אוטומטית (4 שעות)";
                    case "USER_BLOCKED":
                      return "הסתיים — חשבון נחסם";
                    case "TARGET_REMOVED":
                      return "הסתיים — הוסר מהקליניקה";
                    case "TARGET_BLOCKED":
                      return "הסתיים — חשבון יעד נחסם";
                    default:
                      return r.endedReason;
                  }
                })();

                return (
                  <div
                    key={r.id}
                    className="p-3 bg-muted/30 rounded-md border border-border space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="font-medium">
                        {r.impersonatorNameSnapshot || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(start, "dd/MM/yyyy HH:mm", { locale: he })} ·{" "}
                        {durationLabel}
                      </div>
                    </div>
                    {r.reason && (
                      <div className="text-xs text-muted-foreground">
                        <strong>סיבה:</strong> {r.reason}
                      </div>
                    )}
                    {endReasonLabel && (
                      <div className="text-xs text-muted-foreground">{endReasonLabel}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center">
        מוצגות 50 הרשומות האחרונות. כל פעולה שבוצעה תחת ההתחזות נרשמה גם ב-AdminAuditLog
        עם זהות בעל/ת הקליניקה האחראי/ת.
      </div>
    </div>
  );
}
