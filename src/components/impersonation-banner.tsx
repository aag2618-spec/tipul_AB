"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

// H4 (2026-05-17): 30 דקות — חייב להיות זהה ל-IMPERSONATION timeout ב-auth.ts
// וב-cron impersonation-hardkill. קוצר מ-4 שעות מטעמי PHI/אבטחה.
const IMPERSONATION_MAX_DURATION_MS = 30 * 60 * 1000;

// pluralization עברית: יחיד "דקה אחת" / "שעה אחת" (לא "1 דקות" שגוי דקדוקית).
// מטה: ms = remaining time עד timeout. שעון המשתמש משמש (לא השרת),
// אז הצגה עשויה להיות מעט לא מדויקת אם השעון לא מסונכרן — קוסמטי בלבד,
// ה-server עדיין יבדוק את הtimeout ב-JWT callback.
function formatRemaining(ms: number): string {
  if (ms <= 0) return "פג תוקף";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) {
    return totalMinutes === 1 ? "דקה אחת" : `${totalMinutes} דקות`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return hours === 1 ? "שעה אחת" : `${hours} שעות`;
  }
  return `${hours}:${String(minutes).padStart(2, "0")} שעות`;
}

// Banner קבוע למעלה כשה-OWNER במצב impersonation. אדום, sticky, z-50
// כדי שלא יהיה מוסתר על ידי dialogs/modals אחרים.
//
// הוצב ב-Providers (תחת SessionProvider) כך שמופיע על כל עמוד אחרי login.
// useSession() מספיק — אין צורך לשאול את ה-API; ה-token כבר מכיל actingAs.
export function ImpersonationBanner() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const actingAs = session?.user?.actingAs;

  // עדכון countdown כל 30 שניות. ה-banner מוצג בכל הדפים, אז ה-interval
  // תמיד פעיל בעת impersonation. unref-equivalent: useEffect cleanup.
  useEffect(() => {
    if (!actingAs?.startedAt) {
      setRemainingMs(null);
      return;
    }
    function tick() {
      if (!actingAs?.startedAt) return;
      const elapsed = Date.now() - actingAs.startedAt;
      setRemainingMs(IMPERSONATION_MAX_DURATION_MS - elapsed);
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [actingAs?.startedAt]);

  if (!actingAs) return null;

  async function handleStop() {
    setStopping(true);
    try {
      const res = await fetch("/api/clinic-admin/impersonate/stop", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה בעצירת ההתחזות");
      }
      // null → ה-jwt callback מסיר את actingAs מה-token
      await update({ actingAs: null });
      toast.success("יצאת ממצב התחזות");
      router.refresh();
      router.push("/clinic-admin/members");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setStopping(false);
    }
  }

  return (
    <div
      className="sticky top-0 z-50 bg-red-600 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm shadow-md"
      dir="rtl"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <strong>מצב התחזות:</strong> את/ה פועל/ת כעת בתור{" "}
          <strong>{actingAs.name}</strong>. כל פעולה שתבוצע תירשם ותתועד.
          {remainingMs !== null && (
            <span className="opacity-90">
              {" "}· סיום אוטומטי בעוד <strong>{formatRemaining(remainingMs)}</strong>
            </span>
          )}
        </span>
      </div>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="bg-white/20 hover:bg-white/30 disabled:opacity-60 px-3 py-1 rounded inline-flex items-center gap-1 shrink-0 transition-colors"
        aria-label="צא ממצב התחזות"
      >
        {stopping ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <X className="h-3 w-3" />
        )}
        צא ממצב התחזות
      </button>
    </div>
  );
}
