"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  ArrowLeftRight,
  Receipt,
  Loader2,
  Crown,
  Stethoscope,
  Briefcase,
  AlertCircle,
  Wallet,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";

interface OverviewData {
  organization: {
    id: string;
    name: string;
    subscriptionStatus: string;
    aiTier: string;
    pricingPlan: { name: string; baseFeeIls: string | number };
    customContract: { id: string; monthlyEquivPriceIls: string | number; endDate: string } | null;
  };
  counts: {
    owners: number;
    therapists: number;
    secretaries: number;
    clients: number;
    sessions: number;
    transfers: number;
  };
  effectivePrice: {
    monthlyTotalIls: number;
    source: "custom_contract" | "pricing_plan";
    breakdown: {
      baseFeeIls: number;
      therapistsFeeIls: number;
      secretariesFeeIls: number;
      chargeableTherapists: number;
      chargeableSecretaries: number;
      volumeDiscountApplied: boolean;
    };
  } | null;
  smsUsage: {
    quota: number;
    used: number;
    remaining: number;
  } | null;
}

// התראת קרדיט בעזיבה — מקור: PLAN-CLINIC-מטופלים-רב-מטפלים.md סעיף 5.
// מטופל בעזיבה שבחר ללכת עם המטפל/ת ויש לו יתרת קרדיט פתוחה אצל הקליניקה.
interface CreditAlertItem {
  choiceId: string;
  decidedAt: string | null;
  client: { id: string; name: string; creditBalance: number };
  departure: { id: string; decisionDeadline: string };
  departingTherapist: { id: string; name: string };
}

interface CreditAlertResponse {
  count: number;
  totalCreditIls: number;
  items: CreditAlertItem[];
}

const SUBSCRIPTION_LABEL: Record<string, string> = {
  ACTIVE: "פעיל",
  TRIALING: "ניסיון",
  PAST_DUE: "באיחור",
  CANCELLED: "מבוטל",
  PAUSED: "מושהה",
};

const SUBSCRIPTION_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400",
  TRIALING: "bg-blue-500/20 text-blue-400",
  PAST_DUE: "bg-amber-500/20 text-amber-400",
  CANCELLED: "bg-red-500/20 text-red-400",
  PAUSED: "bg-zinc-500/20 text-zinc-400",
};

export default function ClinicAdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [creditAlerts, setCreditAlerts] = useState<CreditAlertResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/clinic-admin/overview");
        if (!res.ok) {
          if (res.status === 404) {
            setError("אינך משויך/ת לקליניקה.");
            return;
          }
          throw new Error();
        }
        const data = await res.json();
        setData(data);
      } catch {
        toast.error("שגיאה בטעינת הסקירה");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // טעינה נפרדת של התראות קרדיט בעזיבה — לא חוסמת את שאר הדף ולא
  // מציגה toast במקרה של כשל (זו תוספת אזהרה, לא מידע ליבה).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clinic-admin/departures/credit-alerts");
        if (!res.ok) return;
        const json = (await res.json()) as CreditAlertResponse;
        setCreditAlerts(json);
      } catch {
        // שקט מכוון — דף הסקירה ממשיך לעבוד גם בלי האזהרה.
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-medium">{error || "לא נטענו נתונים"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const teamSize = data.counts.owners + data.counts.therapists + data.counts.secretaries;
  const smsPct =
    data.smsUsage && data.smsUsage.quota > 0
      ? Math.min(100, (data.smsUsage.used / data.smsUsage.quota) * 100)
      : 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{data.organization.name}</h1>
            <p className="text-sm text-muted-foreground">סקירה כללית של הקליניקה</p>
          </div>
        </div>
        <Badge className={SUBSCRIPTION_BADGE[data.organization.subscriptionStatus]}>
          {SUBSCRIPTION_LABEL[data.organization.subscriptionStatus]}
        </Badge>
      </div>

      {/* התראת יתרת קרדיט במטופלים בעזיבה — דרישת PLAN סעיף 5.
          מוצגת רק כשיש מטופלים שבחרו ללכת עם המטפל/ת ויש להם קרדיט >0.
          ההסדרה מתבצעת ידנית מחוץ למערכת (העברת כסף מבעל הקליניקה
          למטפל/ת היוצא/ת, או החזר למטופל/ת — החלטה ניהולית). */}
      {creditAlerts && creditAlerts.count > 0 && (
        <Card
          className="border-amber-500/40 bg-amber-500/5"
          role="region"
          aria-labelledby="credit-alerts-title"
        >
          <CardHeader className="pb-3">
            <CardTitle
              id="credit-alerts-title"
              className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              יתרת קרדיט פתוחה במטופלים בעזיבה
              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 ms-auto">
                {creditAlerts.count} מטופלים · סה&quot;כ{" "}
                {creditAlerts.totalCreditIls.toLocaleString("he-IL")} ₪
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              המטופלים הבאים בחרו לעבור עם המטפל/ת היוצא/ת ויש להם יתרת קרדיט
              פתוחה אצל הקליניקה. <strong>חשוב להסדיר את הקרדיט עם המטפל/ת
              והמטופל/ת לפני המועד הסופי</strong> — לאחר סיום תהליך העזיבה
              הקרדיט נשאר בקליניקה (כספים לא מועברים אוטומטית).
            </p>
            <div className="space-y-2">
              {creditAlerts.items.map((item) => {
                const deadline = new Date(item.departure.decisionDeadline);
                const msLeft = deadline.getTime() - Date.now();
                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                const deadlineLabel = deadline.toLocaleDateString("he-IL", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  timeZone: "Asia/Jerusalem",
                });
                let timeLeftLabel: string;
                let timeLeftClass = "text-muted-foreground";
                if (msLeft <= 0) {
                  timeLeftLabel = `פג תוקף (${deadlineLabel})`;
                  timeLeftClass = "text-red-600 dark:text-red-400 font-medium";
                } else if (daysLeft === 1) {
                  timeLeftLabel = `יום אחרון (${deadlineLabel})`;
                  timeLeftClass =
                    "text-amber-700 dark:text-amber-400 font-medium";
                } else {
                  timeLeftLabel = `נותרו ${daysLeft} ימים (${deadlineLabel})`;
                }
                return (
                  <div
                    key={item.choiceId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-background/60 rounded-md border border-amber-500/20"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserMinus
                        className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {item.client.name || "מטופל/ת ללא שם"}
                        </p>
                        <p className={`text-xs truncate ${timeLeftClass}`}>
                          עוזב/ת עם {item.departingTherapist.name} ·{" "}
                          {timeLeftLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        ₪{item.client.creditBalance.toLocaleString("he-IL")}
                      </span>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/clients/${item.client.id}`}>
                          לכרטיס המטופל
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* כרטיסים מהירים */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">צוות</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              {teamSize}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">מטופלים</p>
            <p className="text-2xl font-bold mt-1">{data.counts.clients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">פגישות</p>
            <p className="text-2xl font-bold mt-1">{data.counts.sessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">העברות פנימיות</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              {data.counts.transfers}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* פירוט הצוות */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              הרכב הצוות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: "בעלים",
                count: data.counts.owners,
                icon: Crown,
                color: "text-amber-400",
              },
              {
                label: "מטפלים",
                count: data.counts.therapists,
                icon: Stethoscope,
                color: "text-blue-400",
              },
              {
                label: "מזכירות",
                count: data.counts.secretaries,
                icon: Briefcase,
                color: "text-purple-400",
              },
            ].map(({ label, count, icon: Icon, color }) => (
              <div
                key={label}
                className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-md"
              >
                <span className="inline-flex items-center gap-2 text-sm">
                  <Icon className={`h-4 w-4 ${color}`} />
                  {label}
                </span>
                <span className="font-bold">{count}</span>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="w-full mt-2">
              <Link href="/clinic-admin/members">ניהול חברים</Link>
            </Button>
          </CardContent>
        </Card>

        {/* תמחור אפקטיבי */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              תמחור חודשי
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.effectivePrice ? (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">סך לחיוב לחודש</p>
                  <p className="text-3xl font-bold">
                    {data.effectivePrice.monthlyTotalIls.toLocaleString("he-IL")} ₪
                  </p>
                  {data.effectivePrice.source === "custom_contract" && (
                    <Badge className="bg-amber-500/20 text-amber-400 text-xs mt-1">
                      חוזה מותאם
                    </Badge>
                  )}
                </div>

                {data.effectivePrice.source === "pricing_plan" && (
                  <div className="space-y-1.5 text-sm border-t border-border pt-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">מחיר בסיס:</span>
                      <span>{data.effectivePrice.breakdown.baseFeeIls.toLocaleString("he-IL")} ₪</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {data.effectivePrice.breakdown.chargeableTherapists} מטפלים
                        {data.effectivePrice.breakdown.volumeDiscountApplied && " (הנחת נפח)"}:
                      </span>
                      <span>
                        {data.effectivePrice.breakdown.therapistsFeeIls.toLocaleString("he-IL")} ₪
                      </span>
                    </div>
                    {data.effectivePrice.breakdown.chargeableSecretaries > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {data.effectivePrice.breakdown.chargeableSecretaries} מזכירות:
                        </span>
                        <span>
                          {data.effectivePrice.breakdown.secretariesFeeIls.toLocaleString("he-IL")} ₪
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/clinic-admin/billing">פירוט מלא</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">לא ניתן לחשב — חסרה תוכנית תמחור.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SMS usage */}
      {data.smsUsage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">שימוש ב-SMS — חודש נוכחי</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">
                {data.smsUsage.used.toLocaleString("he-IL")} מתוך{" "}
                {data.smsUsage.quota.toLocaleString("he-IL")}
              </span>
              <span className="text-sm font-medium">
                נותרו {data.smsUsage.remaining.toLocaleString("he-IL")}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  smsPct >= 90
                    ? "bg-red-500"
                    : smsPct >= 75
                    ? "bg-amber-500"
                    : "bg-primary"
                }`}
                style={{ width: `${smsPct}%` }}
              />
            </div>
            {smsPct >= 75 && (
              <p className="text-xs text-amber-400 inline-flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                המכסה כמעט מלאה — שקול/י לרכוש חבילה נוספת
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
