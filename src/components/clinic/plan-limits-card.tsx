"use client";

// ============================================================================
// PlanLimitsCard — מציג ניצולת מטפלים/מזכירות בתוכנית
// ============================================================================
// טוען מ-GET /api/clinic-admin/limits ומציג:
//   "מטפלים: 3 מתוך 5 מקומות"
//   "מזכירות: 1 מתוך 3 מקומות"
// אם atLimit → מציג Badge "המקומות מלאים" + הודעה לפנות לתמיכה.
//
// prop refreshKey — לרענון אחרי שינוי (למשל אחרי שליחת הזמנה). העלאת המספר
// תפעיל fetch מחדש (בדיוק כמו useQuery עם key חדש).
// ============================================================================

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserCog, Loader2, Lock } from "lucide-react";

interface LimitInfo {
  current: number;
  max: number | null;
  remaining: number | null;
  atLimit: boolean;
}

interface LimitsResponse {
  therapists: LimitInfo;
  secretaries: LimitInfo;
}

interface PlanLimitsCardProps {
  /** העלאת מספר זה תפעיל fetch מחדש (למשל אחרי הוספת הזמנה). */
  refreshKey?: number;
}

function LimitRow({
  icon,
  label,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  limit: LimitInfo;
}) {
  const isUnlimited = limit.max === null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="font-medium">{label}:</span>
        <span>
          {isUnlimited ? (
            <>
              {limit.current} מקומות (ללא הגבלה)
            </>
          ) : (
            <>
              <strong>{limit.current}</strong> מתוך{" "}
              <strong>{limit.max}</strong> מקומות
            </>
          )}
        </span>
      </div>
      {limit.atLimit && !isUnlimited ? (
        <Badge variant="destructive" className="text-xs gap-1">
          <Lock className="h-3 w-3" />
          המקומות מלאים
        </Badge>
      ) : null}
    </div>
  );
}

export function PlanLimitsCard({ refreshKey = 0 }: PlanLimitsCardProps) {
  const [data, setData] = useState<LimitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/clinic-admin/limits", {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as LimitsResponse;
        if (!cancelled) {
          setData(body);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          // לוג ל-console כדי שתמיכה תוכל לדבג; ב-UI לא חוסם.
          console.warn("[PlanLimitsCard] load failed", err);
          setError(err instanceof Error ? err.message : "שגיאה בטעינה");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <Card dir="rtl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">מקומות בתוכנית הקליניקה</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null; // לא חוסם את הדף בכשל
  }

  const showSupport =
    (data.therapists.atLimit && data.therapists.max !== null) ||
    (data.secretaries.atLimit && data.secretaries.max !== null);

  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">מקומות בתוכנית הקליניקה</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <LimitRow
          icon={<Users className="h-4 w-4 text-primary" />}
          label="מטפלים"
          limit={data.therapists}
        />
        <LimitRow
          icon={<UserCog className="h-4 w-4 text-primary" />}
          label="מזכירות"
          limit={data.secretaries}
        />
        {showSupport ? (
          <p className="pt-2 text-xs text-muted-foreground">
            לשדרוג התוכנית או הוספת מקומות, ניתן לפנות לתמיכה ב-
            <a
              href="mailto:support@mytipul.co.il"
              className="text-primary underline"
            >
              support@mytipul.co.il
            </a>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
