"use client";

// src/app/(dashboard)/dashboard/settings/subscription/SubscriptionClient.tsx
// Stage 4 — Client Component של דף ניהול מנוי.
//
// אחראי על:
//   - תצוגת מצב מנוי, כרטיס שמור, היסטוריית חיובים
//   - דיאלוגי אישור (ביטול חידוש, החזרה לחידוש)
//   - fetch ל-API: /api/subscription/toggle-auto-renew, /api/subscription/update-card
//   - reset של רענון הדף אחרי שינוי (refreshKey כמו ב-PlanLimitsCard בשלב 3)
//
// כל הטקסטים בעברית, RTL.

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CreditCard,
  CheckCircle,
  AlertCircle,
  Calendar,
  Download,
  Loader2,
  XCircle,
  RefreshCw,
  Info,
  Building,
  Crown,
  Ban,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// סוג הנתונים שמועברים מ-Server Component (מקביל ל-view ב-page.tsx).
interface SubscriptionView {
  user: {
    name: string;
    email: string;
    subscriptionStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";
    subscriptionStatusHe: string;
    subscriptionStartedAtIso: string | null;
    subscriptionEndsAtIso: string | null;
    trialEndsAtIso: string | null;
    aiTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
    aiTierLabelHe: string;
    pendingTier: "ESSENTIAL" | "PRO" | "ENTERPRISE" | null;
    pendingTierLabelHe: string | null;
    pendingTierEffectiveAtIso: string | null;
    billingPaidByClinic: boolean;
    isBlocked: boolean;
  };
  card: {
    cardLast4: string;
    cardHolder: string;
    cardBrand: string | null;
    expiryLabel: string;
    expiringSoon: boolean;
  } | null;
  payments: Array<{
    id: string;
    amountIls: number;
    currency: string;
    statusKey: string;
    statusHe: string;
    description: string | null;
    periodStartIso: string | null;
    periodEndIso: string | null;
    paidAtIso: string | null;
    invoicePdfUrl: string | null;
  }>;
  actions: {
    canDisableAutoRenew: boolean;
    disableAutoRenewReason: string | null;
    canEnableAutoRenew: boolean;
    enableAutoRenewReason: string | null;
    canUpdateCard: boolean;
    updateCardReason: string | null;
    autoChargeCurrentlyEnabled: boolean;
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}

function formatAmount(amount: number, currency: string): string {
  const symbol = currency === "ILS" ? "₪" : currency;
  return `${symbol}${amount.toLocaleString("he-IL")}`;
}

function StatusBadge({
  status,
  label,
}: {
  status: SubscriptionView["user"]["subscriptionStatus"];
  label: string;
}) {
  const map: Record<typeof status, { className: string; Icon: typeof CheckCircle }> = {
    ACTIVE: { className: "bg-green-100 text-green-800", Icon: CheckCircle },
    TRIALING: { className: "bg-sky-100 text-sky-800", Icon: Calendar },
    PAST_DUE: { className: "bg-red-100 text-red-800", Icon: AlertCircle },
    CANCELLED: { className: "bg-gray-100 text-gray-800", Icon: XCircle },
    PAUSED: { className: "bg-yellow-100 text-yellow-800", Icon: Info },
  };
  const { className, Icon } = map[status];
  return (
    <Badge className={className}>
      <Icon className="h-3 w-3 ml-1" />
      {label}
    </Badge>
  );
}

function PaymentStatusBadge({
  statusKey,
  statusHe,
}: {
  statusKey: string;
  statusHe: string;
}) {
  const className =
    statusKey === "paid"
      ? "bg-green-100 text-green-800"
      : statusKey === "pending"
        ? "bg-yellow-100 text-yellow-800"
        : statusKey === "overdue"
          ? "bg-red-100 text-red-800"
          : statusKey === "refunded"
            ? "bg-purple-100 text-purple-800"
            : "bg-gray-100 text-gray-800";
  return <Badge className={className}>{statusHe}</Badge>;
}

export default function SubscriptionClient({
  view,
}: {
  view: SubscriptionView;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showEnableDialog, setShowEnableDialog] = useState(false);
  const [working, setWorking] = useState<"toggle" | "update-card" | null>(null);
  // useRef למנוע toast כפול ב-React StrictMode dev (האפקט רץ פעמיים).
  const cardParamHandledRef = useRef(false);

  // ── הודעות אחרי חזרה מ-Cardcom (?card=updated / ?card=failed) ──
  useEffect(() => {
    const cardParam = searchParams.get("card");
    if (!cardParam) return;
    if (cardParamHandledRef.current) return;
    cardParamHandledRef.current = true;

    if (cardParam === "updated") {
      toast.success("הכרטיס עודכן בהצלחה. החיוב הבא יעבור דרך הכרטיס החדש.");
      // ניקוי ה-query param + רענון Server Component כדי לטעון את הכרטיס החדש
      router.replace("/dashboard/settings/subscription");
      router.refresh();
    } else if (cardParam === "failed") {
      toast.error("עדכון הכרטיס נכשל. נסה/י שוב או בחר/י בכרטיס אחר.");
      router.replace("/dashboard/settings/subscription");
    }
  }, [searchParams, router]);

  // ── פעולות ──
  const handleToggle = async (enabled: boolean) => {
    setWorking("toggle");
    try {
      const res = await fetch("/api/subscription/toggle-auto-renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה בעדכון החידוש");
        return;
      }
      toast.success(data.message || (enabled ? "החידוש הופעל" : "החידוש בוטל"));
      router.refresh();
    } catch {
      toast.error("שגיאה בעדכון החידוש");
    } finally {
      setWorking(null);
      setShowDisableDialog(false);
      setShowEnableDialog(false);
    }
  };

  const handleUpdateCard = async () => {
    setWorking("update-card");
    try {
      const res = await fetch("/api/subscription/update-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה ביצירת דף עדכון כרטיס");
        setWorking(null);
        return;
      }
      // redirect ל-Cardcom iframe
      window.location.href = data.paymentUrl;
    } catch {
      toast.error("שגיאה בעדכון כרטיס");
      setWorking(null);
    }
  };

  const { user, card, payments, actions } = view;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto" dir="rtl">
      {/* כותרת */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ניהול מנוי</h1>
        <p className="text-muted-foreground">
          מצב המנוי, פרטי כרטיס שמור, היסטוריית חיובים וקבלות.
        </p>
      </div>

      {/* באנר: הקליניקה משלמת */}
      {user.billingPaidByClinic && (
        <Card className="border-blue-500/40 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Building className="h-5 w-5" />
              המנוי משולם ע״י הקליניקה
            </CardTitle>
            <CardDescription>
              הקליניקה משלמת על המנוי האישי שלך ב-MyTipul. אין צורך לעדכן כרטיס
              או לנהל חידוש ידני. אם תעזב/י את הקליניקה — החיוב יחזור אליך
              אוטומטית.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* באנר: חשבון חסום */}
      {user.isBlocked && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <Ban className="h-5 w-5" />
              החשבון חסום
            </CardTitle>
            <CardDescription>
              ניתן לעדכן פרטי תשלום דרך דף החיוב הרגיל בלבד. לאחר תשלום החוב —
              החסימה תוסר אוטומטית.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* כרטיס: מצב מנוי */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                המנוי שלי
                <StatusBadge
                  status={user.subscriptionStatus}
                  label={user.subscriptionStatusHe}
                />
              </CardTitle>
              <CardDescription>
                מסלול {user.aiTierLabelHe}
                {user.pendingTier && user.pendingTierLabelHe && (
                  <span className="block mt-1 text-xs text-blue-700 dark:text-blue-400">
                    <Crown className="h-3 w-3 inline ml-1" />
                    שדרוג ל-{user.pendingTierLabelHe} ייכנס לתוקף ב-
                    {formatDate(user.pendingTierEffectiveAtIso)}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="text-left text-sm text-muted-foreground">
              {actions.autoChargeCurrentlyEnabled ? (
                <span className="text-green-700 dark:text-green-400">
                  <RefreshCw className="h-3 w-3 inline ml-1" />
                  חידוש אוטומטי פעיל
                </span>
              ) : user.subscriptionStatus !== "CANCELLED" ? (
                <span className="text-amber-700 dark:text-amber-400">
                  <Info className="h-3 w-3 inline ml-1" />
                  חידוש אוטומטי כבוי
                </span>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">תאריך התחלה</div>
              <div className="font-medium">
                {formatDate(user.subscriptionStartedAtIso)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">תוקף עד</div>
              <div className="font-medium">
                {formatDate(user.subscriptionEndsAtIso)}
              </div>
            </div>
            {user.trialEndsAtIso && (
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">סיום ניסיון</div>
                <div className="font-medium">
                  {formatDate(user.trialEndsAtIso)}
                </div>
              </div>
            )}
          </div>

          {user.subscriptionStatus === "PAST_DUE" && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex gap-2 items-start">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800 dark:text-red-300">
                    יש בעיה בתשלום
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                    החיוב נכשל. עדכן/י פרטי כרטיס כדי להמשיך להשתמש בשירות.
                  </p>
                  {actions.canUpdateCard && (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={working === "update-card"}
                      onClick={handleUpdateCard}
                    >
                      {working === "update-card" ? (
                        <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4 ml-1" />
                      )}
                      עדכון כרטיס כעת
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CANCELLED עם תאריך עתידי — הסבר + אופציה להחזיר חידוש */}
          {user.subscriptionStatus === "CANCELLED" &&
            user.subscriptionEndsAtIso &&
            new Date(user.subscriptionEndsAtIso).getTime() > Date.now() && (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex gap-2 items-start">
                  <Info className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      המנוי בוטל
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      עדיין יש גישה מלאה עד{" "}
                      {formatDate(user.subscriptionEndsAtIso)}. לחידוש המנוי
                      יש לרכוש מחדש בדף החיוב.
                    </p>
                  </div>
                </div>
              </div>
            )}

          {/* כפתורי פעולה: ביטול/הפעלת חידוש */}
          {!user.billingPaidByClinic && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="flex flex-wrap gap-2">
                {actions.autoChargeCurrentlyEnabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!actions.canDisableAutoRenew || working !== null}
                    onClick={() => setShowDisableDialog(true)}
                    title={actions.disableAutoRenewReason ?? undefined}
                  >
                    <XCircle className="h-4 w-4 ml-1" />
                    ביטול חידוש אוטומטי
                  </Button>
                ) : (
                  user.subscriptionStatus !== "CANCELLED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!actions.canEnableAutoRenew || working !== null}
                      onClick={() => setShowEnableDialog(true)}
                      title={actions.enableAutoRenewReason ?? undefined}
                    >
                      <RefreshCw className="h-4 w-4 ml-1" />
                      החזרת חידוש אוטומטי
                    </Button>
                  )
                )}
              </div>
              {/* סוכן 3 #7 — disabled-reason כטקסט גלוי (לא רק title שלא נראה במובייל) */}
              {actions.autoChargeCurrentlyEnabled &&
                !actions.canDisableAutoRenew &&
                actions.disableAutoRenewReason && (
                  <p className="text-xs text-muted-foreground">
                    {actions.disableAutoRenewReason}
                  </p>
                )}
              {!actions.autoChargeCurrentlyEnabled &&
                user.subscriptionStatus !== "CANCELLED" &&
                !actions.canEnableAutoRenew &&
                actions.enableAutoRenewReason && (
                  <p className="text-xs text-muted-foreground">
                    {actions.enableAutoRenewReason}
                  </p>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* כרטיס: פרטי כרטיס שמור */}
      {!user.billingPaidByClinic && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              כרטיס לחיוב חוזר
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {card ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">4 ספרות אחרונות</div>
                    <div className="font-mono font-medium">**** {card.cardLast4}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">סוג</div>
                    <div className="font-medium">{card.cardBrand ?? "—"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">תוקף</div>
                    <div className="font-medium">{card.expiryLabel}</div>
                  </div>
                </div>
                {card.expiringSoon && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md flex gap-2 items-start">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      תוקף הכרטיס מסתיים בקרוב — מומלץ לעדכן כעת כדי שחיוב הבא
                      לא ייכשל.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                לא נשמר כרטיס לחיוב חוזר. עדכן/י כרטיס כדי לאפשר חידוש אוטומטי.
              </p>
            )}

            <Button
              variant="default"
              size="sm"
              disabled={!actions.canUpdateCard || working === "update-card"}
              onClick={handleUpdateCard}
              title={actions.updateCardReason ?? undefined}
            >
              {working === "update-card" ? (
                <Loader2 className="h-4 w-4 ml-1 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 ml-1" />
              )}
              {card ? "עדכון כרטיס" : "הוספת כרטיס"}
            </Button>
            {!actions.canUpdateCard && actions.updateCardReason && (
              <p className="text-xs text-muted-foreground">
                {actions.updateCardReason}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* כרטיס: היסטוריית חיובים */}
      <Card>
        <CardHeader>
          <CardTitle>היסטוריית חיובים</CardTitle>
          <CardDescription>10 החיובים האחרונים</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין חיובים להצגה.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-muted/30 rounded-md border border-border space-y-1.5"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {formatAmount(p.amountIls, p.currency)}
                      </span>
                      <PaymentStatusBadge
                        statusKey={p.statusKey}
                        statusHe={p.statusHe}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.paidAtIso
                        ? formatDate(p.paidAtIso)
                        : p.periodStartIso
                          ? formatDate(p.periodStartIso)
                          : "—"}
                    </div>
                  </div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground">
                      {p.description}
                    </div>
                  )}
                  {p.periodStartIso && p.periodEndIso && (
                    <div className="text-xs text-muted-foreground">
                      תקופה: {formatDate(p.periodStartIso)} —{" "}
                      {formatDate(p.periodEndIso)}
                    </div>
                  )}
                  {p.invoicePdfUrl && (
                    <a
                      href={p.invoicePdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Download className="h-3 w-3" />
                      הורדת קבלה
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* דיאלוג ביטול חידוש */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול חידוש אוטומטי</AlertDialogTitle>
            <AlertDialogDescription>
              לאחר ביטול החידוש, המנוי יישאר פעיל עד{" "}
              <strong>{formatDate(user.subscriptionEndsAtIso)}</strong> ולא יחויב
              שוב. תוכל/י להחזיר חידוש בכל עת לפני סיום התקופה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working === "toggle"}>
              ביטול
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggle(false)}
              disabled={working === "toggle"}
            >
              {working === "toggle" && (
                <Loader2 className="h-4 w-4 ml-1 animate-spin" />
              )}
              אישור ביטול חידוש
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* דיאלוג החזרת חידוש */}
      <AlertDialog open={showEnableDialog} onOpenChange={setShowEnableDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>החזרת חידוש אוטומטי</AlertDialogTitle>
            <AlertDialogDescription>
              ה-MyTipul יחייב את הכרטיס השמור (****{" "}
              {card?.cardLast4 ?? "—"}) בסוף התקופה הנוכחית, ב-
              {formatDate(user.subscriptionEndsAtIso)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working === "toggle"}>
              ביטול
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggle(true)}
              disabled={working === "toggle"}
            >
              {working === "toggle" && (
                <Loader2 className="h-4 w-4 ml-1 animate-spin" />
              )}
              אישור החזרת חידוש
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
