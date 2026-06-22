"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  CalendarDays,
  Clock,
  Ban,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { shouldChargeCancellation, hoursUntil } from "@/lib/cancellation";

/**
 * דיאלוג "כל הפגישות של המטופל" — נפתח מהחיפוש המהיר. מציג פגישות קרובות
 * והיסטוריה, ומאפשר לבטל פגישה עתידית לפי מדיניות הביטול של הקליניקה:
 *   • מחוץ לחלון (≥ minCancellationHours) או מחיר 0 → ביטול פשוט, ללא חיוב.
 *   • בתוך החלון ויש מחיר → אזהרה ("בתוך X שעות → ניתן לחייב דמי ביטול"),
 *     אישור נוסף, ובחירה: רשום חוב / גבה עכשיו / ללא חיוב.
 * מזכירה ללא canViewPayments רואה רק "ללא חיוב" (השרת חוסם חיוב ממילא).
 *
 * כל ה-endpoints כבר קיימים — אין כאן לוגיקת כסף חדשה בשרת:
 *   ביטול:  PATCH /api/sessions/[id]/status  (שולח גם הודעת ביטול ללקוח)
 *   חיוב:   POST  /api/payments  (חוב PENDING שמופיע בתשלומים)
 */

interface ClientSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price?: number | string | null;
  clientId?: string | null;
  minCancellationHours?: number | null;
  cancellationReason?: string | null;
  payment?: { status?: string } | null;
}

interface ClientSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  SCHEDULED: { label: "מתוכננת", className: "bg-sky-100 text-sky-800" },
  PENDING_APPROVAL: { label: "ממתינה לאישור", className: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "הושלמה", className: "bg-green-100 text-green-800" },
  CANCELLED: { label: "בוטלה", className: "bg-gray-100 text-gray-700" },
  NO_SHOW: { label: "אי הופעה", className: "bg-red-100 text-red-800" },
  PENDING_CANCELLATION: { label: "ממתינה לביטול", className: "bg-orange-100 text-orange-800" },
};

const TYPE_LABEL: Record<string, string> = {
  ONLINE: "אונליין",
  PHONE: "טלפון",
  BREAK: "הפסקה",
  IN_PERSON: "פרונטלי",
};

export function ClientSessionsDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
}: ClientSessionsDialogProps) {
  const router = useRouter();
  const { permissions } = useMyPermissions();
  const canViewPayments = permissions.canViewPayments;

  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [loading, setLoading] = useState(false);
  // "עכשיו" מקובע פר-פתיחה (מתעדכן ב-effect) — חלוקת קרובות/היסטוריה עקבית.
  const [now, setNow] = useState<Date>(() => new Date());

  // מצב פאנל הביטול (מחליף את הרשימה בתוך אותו דיאלוג — בלי דיאלוגים מקוננים).
  const [cancelTarget, setCancelTarget] = useState<ClientSession | null>(null);
  const [reason, setReason] = useState("");
  // אישור נוסף לחיוב: null = מסך הבחירה; "debt"/"now" = מסך האישור הסופי.
  const [confirmMode, setConfirmMode] = useState<null | "debt" | "now">(null);
  const [processing, setProcessing] = useState(false);

  // טעינת הפגישות בכל פתיחה. includePolicy=true → כל פגישה מקבלת
  // minCancellationHours של המטפל שלה.
  useEffect(() => {
    if (!open || !clientId) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setCancelTarget(null);
    setReason("");
    setConfirmMode(null);
    setNow(new Date());
    fetch(`/api/sessions?clientId=${encodeURIComponent(clientId)}&includePolicy=true`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => {
        if (!cancelled) setSessions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([]);
          toast.error("שגיאה בטעינת הפגישות");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const { upcoming, history } = useMemo(() => {
    const up: ClientSession[] = [];
    const hist: ClientSession[] = [];
    for (const s of sessions) {
      const isUpcoming =
        (s.status === "SCHEDULED" || s.status === "PENDING_APPROVAL") &&
        new Date(s.startTime) >= now;
      if (isUpcoming) up.push(s);
      else hist.push(s);
    }
    up.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    hist.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return { upcoming: up, history: hist };
  }, [sessions, now]);

  const openCancel = useCallback((s: ClientSession) => {
    setCancelTarget(s);
    setReason("");
    setConfirmMode(null);
  }, []);

  const closeCancel = useCallback(() => {
    setCancelTarget(null);
    setReason("");
    setConfirmMode(null);
  }, []);

  // ביטול בפועל.
  //   charge=true  → PUT עם createPayment: השרת מבטל ויוצר חוב PENDING באופן
  //                  אטומי — אם יצירת החיוב נכשלת הוא מחזיר את הפגישה למצבה
  //                  הקודם (אין ביטול-בלי-חיוב ואין חיוב-בלי-ביטול). זהה
  //                  לזרימת "עדכון ורשום חוב" שביומן.
  //   charge=false → PATCH status: ביטול ללא חיוב, ששולח גם הודעת ביטול ללקוח
  //                  לפי הגדרות התקשורת.
  //   collectNow   → אחרי רישום החוב, מעבר למסך התשלום של המטופל לגבייה מיידית.
  const doCancel = useCallback(
    async (opts: { charge: boolean; collectNow: boolean }) => {
      if (!cancelTarget) return;
      const target = cancelTarget;
      const price = Number(target.price || 0);
      const cId = target.clientId || clientId;
      if (!cId) {
        toast.error("חסר מזהה מטופל");
        return;
      }
      const willCharge = opts.charge && price > 0;
      setProcessing(true);
      try {
        const res = willCharge
          ? await fetch(`/api/sessions/${target.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "CANCELLED",
                createPayment: true,
                markAsPaid: false,
                cancellationReason: reason.trim() || undefined,
              }),
            })
          : await fetch(`/api/sessions/${target.id}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "CANCELLED",
                cancellationReason: reason.trim() || undefined,
              }),
            });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          toast.error(err?.message || "שגיאה בביטול הפגישה");
          return;
        }
        setSessions((prev) =>
          prev.map((s) =>
            s.id === target.id
              ? { ...s, status: "CANCELLED", cancellationReason: reason.trim() }
              : s,
          ),
        );
        toast.success(willCharge ? "הפגישה בוטלה — נרשם חיוב" : "הפגישה בוטלה");
        closeCancel();
        if (opts.collectNow && willCharge) {
          onOpenChange(false);
          router.push(`/dashboard/payments/pay/${cId}`);
        }
      } catch {
        toast.error("שגיאה בביטול הפגישה");
      } finally {
        setProcessing(false);
      }
    },
    [cancelTarget, reason, clientId, router, onOpenChange, closeCancel],
  );

  // זמן חי (לא ה-now המקובע) — כדי שכפתור "בטל" ייעלם אוטומטית אם הפגישה עברה
  // בזמן שהדיאלוג פתוח. החלוקה לקרובות/היסטוריה כן נשארת יציבה לפי ה-now המקובע.
  const isCancellable = (s: ClientSession) =>
    s.status === "SCHEDULED" &&
    s.type !== "BREAK" &&
    new Date(s.startTime).getTime() > Date.now();

  const renderRow = (s: ClientSession, cancellable: boolean) => {
    const badge = STATUS_BADGE[s.status] || {
      label: s.status,
      className: "bg-muted text-foreground",
    };
    const price = Number(s.price || 0);
    return (
      <div
        key={s.id}
        className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {format(new Date(s.startTime), "EEEE, d/M/yyyy", { locale: he })}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(s.startTime), "HH:mm")}
            {" · "}
            {TYPE_LABEL[s.type] || s.type}
            {price > 0 ? ` · ₪${price}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {cancellable && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => openCancel(s)}
            >
              <Ban className="h-3.5 w-3.5" />
              בטל
            </Button>
          )}
        </div>
      </div>
    );
  };

  // ── פאנל הביטול (מחליף את הרשימה) ──
  const renderCancelPanel = (target: ClientSession) => {
    const price = Number(target.price || 0);
    const minHours = target.minCancellationHours ?? 24;
    const hrs = hoursUntil(target.startTime, new Date());
    const within = shouldChargeCancellation(hrs, minHours, price);

    return (
      <div className="space-y-4">
        <button
          onClick={closeCancel}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          disabled={processing}
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לרשימה
        </button>

        <div className="rounded-lg border p-3 bg-muted/30">
          <p className="text-sm font-medium">
            {format(new Date(target.startTime), "EEEE, d/M/yyyy בשעה HH:mm", { locale: he })}
          </p>
          {price > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">מחיר הפגישה: ₪{price}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">סיבת ביטול (אופציונלי)</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="לדוגמה: מחלה, בקשת מטופל..."
            className="resize-none h-20 bg-muted/20"
            disabled={processing}
          />
        </div>

        {/* בתוך חלון החיוב + יש מחיר */}
        {within && price > 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg border bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                הביטול הוא בתוך <span className="font-semibold">{minHours} שעות</span> מהפגישה.
                לפי מדיניות הקליניקה ניתן לחייב דמי ביטול של{" "}
                <span className="font-semibold">₪{price}</span>.
              </p>
            </div>

            {canViewPayments ? (
              confirmMode ? (
                // אישור נוסף לחיוב
                <div className="space-y-3 p-3 rounded-lg border bg-emerald-50 border-emerald-200">
                  <p className="text-sm font-semibold text-emerald-800">
                    אישור: לחייב דמי ביטול של ₪{price}
                    {confirmMode === "now" ? " ולעבור למסך התשלום?" : "?"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        doCancel({ charge: true, collectNow: confirmMode === "now" })
                      }
                      disabled={processing}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : confirmMode === "now" ? (
                        "כן, חייב וגבה"
                      ) : (
                        "כן, חייב"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmMode(null)}
                      disabled={processing}
                      className="flex-1"
                    >
                      חזרה
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setConfirmMode("debt")}
                      disabled={processing}
                      variant="outline"
                      className="flex-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                    >
                      רשום חוב
                    </Button>
                    <Button
                      onClick={() => setConfirmMode("now")}
                      disabled={processing}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      גבה עכשיו
                    </Button>
                  </div>
                  <Button
                    onClick={() => doCancel({ charge: false, collectNow: false })}
                    disabled={processing}
                    variant="ghost"
                    className="w-full text-muted-foreground"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "בטל ללא חיוב"}
                  </Button>
                </div>
              )
            ) : (
              // מזכירה ללא הרשאת תשלומים — רק ביטול ללא חיוב
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  חיוב דמי ביטול דורש הרשאת תשלומים.
                </p>
                <Button
                  onClick={() => doCancel({ charge: false, collectNow: false })}
                  disabled={processing}
                  variant="destructive"
                  className="w-full"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "בטל ללא חיוב"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          // מחוץ לחלון / ללא עלות — ביטול פשוט
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {price > 0
                ? "הביטול מחוץ לחלון החיוב — לא ייווצר חיוב דמי ביטול."
                : "פגישה ללא עלות — אין חיוב."}
            </p>
            <Button
              onClick={() => doCancel({ charge: false, collectNow: false })}
              disabled={processing}
              variant="destructive"
              className="w-full"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "בטל פגישה"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) closeCancel();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>הפגישות של {clientName}</DialogTitle>
          <DialogDescription>
            {cancelTarget ? "ביטול פגישה" : "צפייה בכל הפגישות וביטול לפי מדיניות הקליניקה"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : cancelTarget ? (
            renderCancelPanel(cancelTarget)
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              אין פגישות למטופל זה
            </div>
          ) : (
            <Tabs defaultValue="upcoming" dir="rtl">
              <TabsList className="bg-muted/40 p-1 h-auto">
                <TabsTrigger value="upcoming" className="gap-1.5 px-3 py-1.5">
                  <CalendarDays className="h-4 w-4" />
                  קרובות ({upcoming.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5 px-3 py-1.5">
                  <Clock className="h-4 w-4" />
                  היסטוריה ({history.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming" className="mt-3 space-y-2">
                {upcoming.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    אין פגישות קרובות
                  </div>
                ) : (
                  upcoming.map((s) => renderRow(s, isCancellable(s)))
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-3 space-y-2">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    אין היסטוריה
                  </div>
                ) : (
                  history.map((s) => renderRow(s, false))
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
