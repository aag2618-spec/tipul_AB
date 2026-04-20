"use client";

import { useEffect, useState } from "react";

export type ShabbatStatus = {
  isShabbat: boolean;
  reason: "SHABBAT" | "YOM_TOV" | null;
  endsAt: string | null;
  name: string | null;
  isDegraded: boolean;
};

export type UseShabbat = ShabbatStatus & {
  tooltip: string | null;
  loading: boolean;
};

const DEFAULT_STATUS: ShabbatStatus = {
  isShabbat: false,
  reason: null,
  endsAt: null,
  name: null,
  isDegraded: false,
};

const REFRESH_MS = 5 * 60_000; // 5 דקות — מספיק סביב מעברי שבת

/**
 * Hook שמחזיר את מצב השבת הנוכחי עבור UI.
 * משתמש ב-polling פשוט (5 דקות) של /api/shabbat/status.
 *
 * @example
 * const { isShabbat, tooltip } = useShabbat();
 * <Button disabled={isShabbat} title={tooltip ?? undefined}>שלח</Button>
 */
export function useShabbat(): UseShabbat {
  const [status, setStatus] = useState<ShabbatStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/shabbat/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ShabbatStatus;
        if (!cancelled) {
          setStatus(data);
        }
      } catch {
        // אם ה-fetch נכשל — משאירים מצב קודם, ה-retry יגיע בפינג הבא
      } finally {
        // תמיד לסמן loading=false כדי שה-UI לא יישאר תקוע במצב טעינה
        // (גם אם fetch נכשל או הוחזר status לא-OK — משתמשים ב-DEFAULT_STATUS).
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStatus();
    timer = setInterval(fetchStatus, REFRESH_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const tooltip = buildTooltip(status);

  return {
    ...status,
    tooltip,
    loading,
  };
}

function buildTooltip(s: ShabbatStatus): string | null {
  if (!s.isShabbat) return null;
  if (s.isDegraded) {
    return "המערכת במצב תחזוקה — שליחת הודעות מושבתת זמנית";
  }
  if (s.reason === "YOM_TOV") {
    const name = s.name ? ` (${s.name})` : "";
    return `חג שמח${name} — חזור במוצאי החג`;
  }
  if (s.reason === "SHABBAT") {
    return "שבת שלום — חזור במוצאי שבת";
  }
  return "לא ניתן לשלוח הודעות כרגע";
}
