"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2, Wrench, CreditCard } from "lucide-react";
import { toast } from "sonner";

type FakePaidPayment = {
  id: string;
  amount: number;
  paidAt: string | null;
  createdAt: string;
  client: { id: string; name: string } | null;
  session: { id: string; startTime: string } | null;
  cardcomTransactionsCount: number;
  latestCardcomStatus: string;
};

export default function CardcomCleanupPage() {
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState(false);
  const [payments, setPayments] = useState<FakePaidPayment[]>([]);
  const [done, setDone] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/maintenance/cardcom-fake-paid", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { payments: FakePaidPayment[] };
      setPayments(data.payments ?? []);
    } catch {
      toast.error("שגיאה בטעינת תשלומים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleRevert = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `${payments.length} תשלומים יוחזרו לסטטוס "ממתין".\nאם בפועל החיוב הצליח (אפשר לאמת ב-Cardcom dashboard) — תוכל לסמן ידנית כשולם אחר כך.\nלהמשיך?`
      )
    ) {
      return;
    }
    setReverting(true);
    try {
      const res = await fetch("/api/maintenance/cardcom-fake-paid", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { count: number };
      toast.success(`${data.count} תשלומים הוחזרו לממתין`);
      setDone(true);
      await refresh();
    } catch {
      toast.error("התיקון נכשל");
    } finally {
      setReverting(false);
    }
  };

  const STATUS_LABEL: Record<string, string> = {
    PENDING: "ממתין",
    APPROVED: "אושר",
    DECLINED: "נדחה",
    FAILED: "כשל",
    CANCELLED: "בוטל",
    EXPIRED: "פג תוקף",
    none: "אין רשומה",
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          תיקון תשלומי אשראי שסומנו "שולם" בטעות
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          באג שתוקן ב-29/04/2026 גרם ל-cron יומי לסמן תשלומי אשראי כ"שולם" גם אם
          Cardcom לא חייב בפועל. הכלי הזה מאתר תשלומים כאלו (אין להם CardcomTransaction
          מאושר) ומחזיר אותם ל"ממתין". הבאג עצמו תוקן — מצב זה לא ייווצר שוב.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : payments.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="font-bold text-emerald-700">
              {done ? "התשלומים תוקנו" : "אין תשלומים לתיקון"}
            </p>
            <p className="text-sm text-muted-foreground">המערכת נקייה מהבאג.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-5 w-5" />
              נמצאו {payments.length} תשלומי אשראי שסומנו "שולם" בלי חיוב אמיתי
            </CardTitle>
            <CardDescription>
              לחיצה על &quot;תקן עכשיו&quot; תחזיר אותם לסטטוס &quot;ממתין לתשלום&quot;.
              לפני התיקון — בדוק ב-Cardcom dashboard אם בפועל היה חיוב מוצלח לאחד מהם.
              אם כן — אחרי התיקון תוכל לסמן ידנית כשולם דרך הדיאלוג הרגיל.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-right p-2">מטופל</th>
                    <th className="text-right p-2">סכום</th>
                    <th className="text-right p-2">סומן שולם</th>
                    <th className="text-right p-2">סטטוס Cardcom</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const fmt = (d: string | null) =>
                      d
                        ? new Date(d).toLocaleString("he-IL", {
                            timeZone: "Asia/Jerusalem",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—";
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.client?.name ?? "ללא מטופל"}</td>
                        <td className="p-2">₪{Number(p.amount).toFixed(0)}</td>
                        <td className="p-2">{fmt(p.paidAt)}</td>
                        <td className="p-2">
                          <span className="text-xs text-muted-foreground">
                            {STATUS_LABEL[p.latestCardcomStatus] ?? p.latestCardcomStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button
              onClick={handleRevert}
              disabled={reverting}
              className="w-full bg-amber-600 hover:bg-amber-700"
            >
              {reverting ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  מתקן...
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4 ml-2" />
                  תקן עכשיו ({payments.length} תשלומים)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
