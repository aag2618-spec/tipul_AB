"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

type BadSession = {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  client: { id: string; name: string } | null;
};

export default function SessionsMaintenancePage() {
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [sessions, setSessions] = useState<BadSession[]>([]);
  const [done, setDone] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions/cleanup-bad-times", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { sessions: BadSession[] };
      setSessions(data.sessions ?? []);
    } catch {
      toast.error("שגיאה בטעינת פגישות שגויות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleFix = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `${sessions.length} פגישות יבוטלו (לא יימחקו) — אפשר ליצור אותן מחדש בשעות נכונות.\nלהמשיך?`
      )
    ) {
      return;
    }
    setFixing(true);
    try {
      const res = await fetch("/api/sessions/cleanup-bad-times", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { count: number };
      toast.success(`בוטלו ${data.count} פגישות שגויות`);
      setDone(true);
      await refresh();
    } catch {
      toast.error("התיקון נכשל");
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="h-6 w-6" />
          תיקון פגישות עם שעות שגויות
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          פגישה עם שעת סיום לפני שעת התחלה, או משך מעל 12 שעות, חוסמת יצירת פגישות חדשות
          (התנגשויות שגויות). הכלי הזה מאתר פגישות כאלו ומבטל אותן.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="font-bold text-emerald-700">
              {done ? "הפגישות תוקנו" : "אין פגישות שגויות"}
            </p>
            <p className="text-sm text-muted-foreground">היומן נקי. אפשר לחזור לעבודה רגילה.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-5 w-5" />
              נמצאו {sessions.length} פגישות שגויות
            </CardTitle>
            <CardDescription>
              לחיצה על &quot;תקן עכשיו&quot; תבטל אותן (סטטוס יהפוך ל&quot;בוטלה&quot;). לא נמחקות —
              ההיסטוריה נשמרת. אם פגישה הייתה אמורה להתקיים, צרי אותה מחדש בשעות נכונות.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-right p-2">מטופל</th>
                    <th className="text-right p-2">התחלה</th>
                    <th className="text-right p-2">סיום</th>
                    <th className="text-right p-2">משך</th>
                    <th className="text-right p-2">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const start = new Date(s.startTime);
                    const end = new Date(s.endTime);
                    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
                    const fmt = (d: Date) =>
                      d.toLocaleString("he-IL", {
                        timeZone: "Asia/Jerusalem",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="p-2">{s.client?.name ?? "ללא מטופל"}</td>
                        <td className="p-2">{fmt(start)}</td>
                        <td className="p-2">{fmt(end)}</td>
                        <td className="p-2">
                          {durationMinutes < 0
                            ? `הפוך (${durationMinutes} דק׳)`
                            : `${(durationMinutes / 60).toFixed(1)} שעות`}
                        </td>
                        <td className="p-2">{s.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button
              onClick={handleFix}
              disabled={fixing}
              className="w-full bg-amber-600 hover:bg-amber-700"
            >
              {fixing ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  מתקן...
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4 ml-2" />
                  תקן עכשיו ({sessions.length} פגישות)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
