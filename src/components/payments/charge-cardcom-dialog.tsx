"use client";

// src/components/payments/charge-cardcom-dialog.tsx
// דיאלוג סליקה דרך Cardcom — צד מטפל.
//
// תומך בשתי שיטות גבייה (לפי `סקירה סופית של התקנת האשראי.md`):
//   1) שליחת קישור במייל/SMS    (ברירת מחדל)
//   2) הזנת פרטי כרטיס עכשיו    (iframe)
//
// אופציונלית: שמירת כרטיס לטוקן עתידי (שלב 3 בתוכנית).
//
// התמונה הגדולה:
//   setup  → creating  → ┬─ link-sent (polling) → success / failure
//                       └─ iframe   (polling) → success / failure
//
// הרכיב self-contained: יוצר Payment חדש אם אין paymentId, ואז קורא ל-
// /api/payments/[id]/charge-cardcom להשגת ה-URL של Cardcom.

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Loader2,
  Mail,
  MessageSquare,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type Step =
  | "setup"
  | "creating"
  | "link-sent"
  | "iframe"
  | "success"
  | "failure"
  | "timeout";

type Channel = "sms" | "email" | "both";
type PayMode = "link" | "iframe";

interface ChargeCardcomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** אם קיים — נשתמש בו ישירות. אם לא — ניצור Payment חדש מ-sessionId+clientId+amount. */
  paymentId?: string;
  sessionId?: string;
  clientId: string;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  /** הסכום שמוצע למשתמש (יכול להיות modified ב-form). */
  amount: number;
  /** תיאור ברירת מחדל (יכול להיות modified ב-form). */
  defaultDescription?: string;
  /** קולבק אחרי תשלום מוצלח (לרענון UI חיצוני). */
  onPaymentSuccess?: () => Promise<void> | void;
}

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 60_000;

export function ChargeCardcomDialog({
  open,
  onOpenChange,
  paymentId: incomingPaymentId,
  sessionId,
  clientId,
  clientName,
  // ⚠️ Renamed to "prop*" so the rest of the component can refer to
  // `clientPhone`/`clientEmail` as the EFFECTIVE values (props OR
  // lazily-fetched fallback). See `effectivePhone`/`effectiveEmail` below.
  clientPhone: propClientPhone,
  clientEmail: propClientEmail,
  amount,
  defaultDescription,
  onPaymentSuccess,
}: ChargeCardcomDialogProps) {
  // ── Lazy contact fallback ──────────────────────────────────
  // Many call sites of QuickMarkPaid don't have phone/email at hand
  // (they live in the client record but aren't always passed through).
  // Rather than thread the props through 8 different parents, we fetch
  // them on first open via the lightweight /api/clients/[id]/contact
  // endpoint. Props always take priority if provided.
  const [fetchedContact, setFetchedContact] = useState<{
    phone: string | null;
    email: string | null;
  } | null>(null);
  const clientPhone = propClientPhone ?? fetchedContact?.phone ?? null;
  const clientEmail = propClientEmail ?? fetchedContact?.email ?? null;

  // ── Form state ──────────────────────────────────────────────
  const [installments, setInstallments] = useState<number>(1);
  const [description, setDescription] = useState<string>(defaultDescription ?? "");
  const [payMode, setPayMode] = useState<PayMode>("link");
  const [channel, setChannel] = useState<Channel>(() => {
    if (propClientEmail && propClientPhone) return "both";
    if (propClientEmail) return "email";
    if (propClientPhone) return "sms";
    return "email";
  });
  const [saveCard, setSaveCard] = useState<boolean>(false);

  // ── Flow state ──────────────────────────────────────────────
  const [step, setStep] = useState<Step>("setup");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [paymentPageUrl, setPaymentPageUrl] = useState<string>("");
  const [transactionId, setTransactionId] = useState<string>("");
  const [paymentId, setPaymentId] = useState<string | undefined>(incomingPaymentId);
  const [linkResults, setLinkResults] = useState<
    Array<{ channel: "sms" | "email"; success: boolean; error?: string }>
  >([]);
  // ── Resend cooldown ─────────────────────────────────────────
  // After every successful re-send, lock the button for 30s. Two reasons:
  //  1) Backend is rate-limited; better to surface that visually instead of
  //     letting the therapist hammer the button until it 429s.
  //  2) Reduces SMS-cost waste from accidental double-clicks.
  const RESEND_COOLDOWN_MS = 30_000;
  const [resendCooldownEndsAt, setResendCooldownEndsAt] = useState<number>(0);
  const [resendCooldownLeft, setResendCooldownLeft] = useState<number>(0);
  const [isResending, setIsResending] = useState<boolean>(false);

  // Idempotency-Key מתקיים ל-window אחד של ניסיון (שני קליקים מהירים → אותה תוצאה).
  const idempotencyKeyRef = useRef<string>("");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAtRef = useRef<number>(0);
  // Generation id — מתעדכן בכל פתיחה/reset/סגירה. מונע race-condition של polls
  // ישנים שמסיימים אחרי שהדיאלוג נסגר/אופס ומפעילים setStep("success") מטעה.
  const generationRef = useRef<number>(0);
  // נעילת in-flight למניעת לחיצה כפולה על "גבה" שתיצור 2 רשומות Payment.
  const inFlightRef = useRef<boolean>(false);

  // ── Reset on close ──────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      // Cleanup
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      // Bump generation — כל poll/fetch ישן שיחזור עכשיו יתעלם.
      generationRef.current++;
      inFlightRef.current = false;
      // Reset only if we're past setup (avoid resetting while user is typing).
      if (step !== "setup") {
        setStep("setup");
        setErrorMessage("");
        setPaymentPageUrl("");
        setTransactionId("");
        setPaymentId(incomingPaymentId);
        setLinkResults([]);
        idempotencyKeyRef.current = "";
      }
    }
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Resend cooldown ticker ──────────────────────────────────
  // While a cooldown is active, refresh the visible "Xs" countdown every
  // second. Cleans itself up when cooldown ends or dialog closes.
  useEffect(() => {
    if (resendCooldownEndsAt <= 0) return;
    const tick = (): void => {
      const left = Math.max(
        0,
        Math.ceil((resendCooldownEndsAt - Date.now()) / 1000)
      );
      setResendCooldownLeft(left);
      if (left <= 0) {
        setResendCooldownEndsAt(0);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [resendCooldownEndsAt]);

  // Reset cooldown whenever the dialog closes (avoid stale lock on next open).
  useEffect(() => {
    if (!open) {
      setResendCooldownEndsAt(0);
      setResendCooldownLeft(0);
      setIsResending(false);
    }
  }, [open]);

  // ── Lazy fetch of phone/email when not provided as props ───
  // Triggers only on first open with both props missing AND no fetch yet.
  useEffect(() => {
    if (!open) return;
    if (propClientPhone || propClientEmail) return;
    if (fetchedContact) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/contact`);
        if (!res.ok) {
          if (!cancelled) setFetchedContact({ phone: null, email: null });
          return;
        }
        const data = (await res.json()) as {
          phone: string | null;
          email: string | null;
        };
        if (!cancelled) {
          setFetchedContact({
            phone: data.phone ?? null,
            email: data.email ?? null,
          });
          // Auto-pick channel once we know what's available.
          setChannel((prev) => {
            const hasPhone = !!data.phone;
            const hasEmail = !!data.email;
            if (hasPhone && hasEmail) return prev === "email" ? "both" : prev;
            if (hasEmail) return "email";
            if (hasPhone) return "sms";
            return prev;
          });
        }
      } catch {
        if (!cancelled) setFetchedContact({ phone: null, email: null });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId, propClientPhone, propClientEmail]);

  // ── Helpers ─────────────────────────────────────────────────
  const channels: Array<"sms" | "email"> =
    channel === "both" ? ["sms", "email"] : [channel];

  const canSendBy = (c: "sms" | "email"): boolean =>
    c === "sms" ? !!clientPhone : !!clientEmail;

  const validChannels = channels.filter(canSendBy);

  const buildIdempotencyKey = (): string => {
    if (!idempotencyKeyRef.current) {
      // ה-API מצפה ל-Idempotency-Key לכל-USER. שילוב של תאריך+random מספיק
      // לחלון הניסיון הזה. הריקוד הזה נמנע משימוש ב-uuid (תלות חיצונית מיותרת).
      const r = crypto.getRandomValues(new Uint8Array(16));
      idempotencyKeyRef.current =
        Date.now().toString(36) +
        "-" +
        Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    return idempotencyKeyRef.current;
  };

  const ensurePaymentId = async (): Promise<string> => {
    if (paymentId) return paymentId;
    // יוצרים Payment חדש (PENDING) — webhook יסמן PAID אחר כך.
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        sessionId,
        amount,
        expectedAmount: amount,
        method: "CREDIT_CARD",
        status: "PENDING",
        // הקבלה תופק אוטומטית ע"י Cardcom (Documents API) ב-webhook,
        // אז לא להפיק קבלה פנימית כפולה כאן.
        issueReceipt: false,
        notes: description || undefined,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message ?? "שגיאה ביצירת רישום תשלום");
    }
    const data = (await res.json()) as { id: string };
    setPaymentId(data.id);
    return data.id;
  };

  const startCardcom = async (): Promise<void> => {
    // Atomic in-flight lock — מונע race של 2 לחיצות מקבילות שיוצרות 2 Payment rows.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    // gen נשמר על-stack כדי שאם המשתמש סוגר באמצע, נדע להתעלם מהמשך הזרימה.
    const gen = ++generationRef.current;
    setStep("creating");
    setErrorMessage("");

    try {
      const pid = await ensurePaymentId();
      if (gen !== generationRef.current) return;

      // יצירת דף תשלום ב-Cardcom
      const res = await fetch(`/api/payments/${pid}/charge-cardcom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": buildIdempotencyKey(),
        },
        body: JSON.stringify({
          numOfPayments: installments,
          createToken: saveCard,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        url?: string;
        transactionId?: string;
      };

      if (!res.ok || !data.url || !data.transactionId) {
        throw new Error(data.message ?? "שגיאה ביצירת דף תשלום");
      }
      if (gen !== generationRef.current) return;

      setPaymentPageUrl(data.url);
      setTransactionId(data.transactionId);

      if (payMode === "link") {
        // שליחת לינק
        const sendRes = await fetch(`/api/payments/${pid}/send-cardcom-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentPageUrl: data.url,
            channels: validChannels,
          }),
        });
        const sendData = (await sendRes.json().catch(() => ({}))) as {
          message?: string;
          success?: boolean;
          results?: Array<{
            channel: "sms" | "email";
            success: boolean;
            error?: string;
          }>;
        };
        if (gen !== generationRef.current) return;
        if (!sendRes.ok || !sendData.success) {
          // ה-Cardcom URL כבר נוצר; המשתמש יכול להעתיק ידני, אז נציג מסך לינק
          // עם השגיאה אבל לא נחזור ל-setup.
          setLinkResults(sendData.results ?? []);
          setStep("link-sent");
          setErrorMessage(
            sendData.results?.find((r) => !r.success)?.error ??
              sendData.message ??
              "שליחת הלינק נכשלה (אך ה-URL נוצר וניתן להעתיק ידני)"
          );
          startPolling(data.transactionId, gen);
          return;
        }
        setLinkResults(sendData.results ?? []);
        setStep("link-sent");
        startPolling(data.transactionId, gen);
      } else {
        // iframe
        setStep("iframe");
        startPolling(data.transactionId, gen);
      }
    } catch (err) {
      if (gen !== generationRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep("failure");
    } finally {
      inFlightRef.current = false;
    }
  };

  // ── Status polling ──────────────────────────────────────────
  const startPolling = (txId: string, gen: number): void => {
    pollStartedAtRef.current = Date.now();
    pollOnce(txId, gen);
  };

  const pollOnce = async (txId: string, gen: number): Promise<void> => {
    // generation guard — כל קריאה ישנה (אחרי close/reset) פשוט תיעלם.
    if (gen !== generationRef.current) return;
    if (Date.now() - pollStartedAtRef.current > POLL_TIMEOUT_MS) {
      // Timeout — לא מתייאשים. webhook ירוץ ברקע ממילא, אבל למשתמש נציג
      // הודעה ברורה ולא להשאיר ספינר תקוע.
      setStep("timeout");
      return;
    }
    try {
      const res = await fetch(`/api/p/transaction-status?t=${encodeURIComponent(txId)}`);
      if (gen !== generationRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as { status?: string };
        if (gen !== generationRef.current) return;
        if (data.status === "APPROVED") {
          setStep("success");
          toast.success("התשלום בוצע בהצלחה");
          if (onPaymentSuccess) {
            try {
              await onPaymentSuccess();
            } catch (err) {
              console.error("onPaymentSuccess error:", err);
            }
          }
          // סגירה אוטומטית אחרי 2 שניות — generation guard ב-onOpenChange
          // ימנע closes כפולים אם המשתמש סגר ידנית בינתיים.
          setTimeout(() => {
            if (gen === generationRef.current) onOpenChange(false);
          }, 2000);
          return;
        }
        if (
          data.status === "DECLINED" ||
          data.status === "FAILED" ||
          data.status === "CANCELLED" ||
          data.status === "EXPIRED"
        ) {
          setStep("failure");
          const labelMap: Record<string, string> = {
            DECLINED: "התשלום נדחה ע״י חברת האשראי",
            FAILED: "אירעה שגיאה טכנית בעת התשלום",
            CANCELLED: "התשלום בוטל ע״י הלקוח",
            EXPIRED: "דף התשלום פג תוקף",
          };
          setErrorMessage(`${labelMap[data.status]}. ניתן לנסות שיטה אחרת.`);
          return;
        }
      }
    } catch {
      // שגיאת רשת — נמשיך לנסות
    }
    pollTimerRef.current = setTimeout(() => pollOnce(txId, gen), POLL_INTERVAL_MS);
  };

  const handleResendLink = async (): Promise<void> => {
    if (!paymentPageUrl || !paymentId) return;
    if (isResending) return;
    if (resendCooldownLeft > 0) return;
    setIsResending(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}/send-cardcom-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentPageUrl,
          channels: validChannels,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        success?: boolean;
        results?: Array<{ channel: "sms" | "email"; success: boolean; error?: string }>;
      };
      if (res.ok && data.success) {
        setLinkResults(data.results ?? []);
        toast.success("הלינק נשלח שוב");
        // Start cooldown only on a successful re-send.
        const endsAt = Date.now() + RESEND_COOLDOWN_MS;
        setResendCooldownEndsAt(endsAt);
        setResendCooldownLeft(Math.ceil(RESEND_COOLDOWN_MS / 1000));
      } else {
        toast.error(data.message ?? "שליחה חוזרת נכשלה");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שליחה חוזרת נכשלה");
    } finally {
      setIsResending(false);
    }
  };

  const handleCopyLink = async (): Promise<void> => {
    if (!paymentPageUrl) return;
    try {
      await navigator.clipboard.writeText(paymentPageUrl);
      toast.success("הקישור הועתק");
    } catch {
      toast.error("העתקה נכשלה — סמן ידנית");
    }
  };

  const reset = (): void => {
    setStep("setup");
    setErrorMessage("");
    setPaymentPageUrl("");
    setTransactionId("");
    setPaymentId(incomingPaymentId);
    setLinkResults([]);
    idempotencyKeyRef.current = "";
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            גבייה באשראי — {clientName}
          </DialogTitle>
          {step === "setup" && (
            <DialogDescription>
              סליקה מאובטחת דרך Cardcom. הסכום בש&quot;ח.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === "setup" && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-right">סכום</Label>
              <div className="text-2xl font-bold">₪{amount}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc-description">תיאור</Label>
              <Input
                id="cc-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="פגישת 22/04"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 items-center">
              <Label htmlFor="cc-installments">מספר תשלומים</Label>
              <Select
                value={String(installments)}
                onValueChange={(v) => setInstallments(parseInt(v, 10))}
              >
                <SelectTrigger id="cc-installments">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? "תשלום אחד" : `${n} תשלומים`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-3 space-y-2 bg-blue-50/40">
              <Label className="font-semibold">איך לגבות?</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/60">
                  <input
                    type="radio"
                    name="cc-paymode"
                    value="link"
                    checked={payMode === "link"}
                    onChange={() => setPayMode("link")}
                    className="h-4 w-4"
                  />
                  <span>
                    <span className="font-medium">שלח קישור במייל/SMS</span>
                    <span className="block text-xs text-muted-foreground">
                      הלקוח משלם בזמן שלו
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/60">
                  <input
                    type="radio"
                    name="cc-paymode"
                    value="iframe"
                    checked={payMode === "iframe"}
                    onChange={() => setPayMode("iframe")}
                    className="h-4 w-4"
                  />
                  <span>
                    <span className="font-medium">הזן פרטי כרטיס עכשיו (iframe)</span>
                    <span className="block text-xs text-muted-foreground">
                      תשלום מיידי — הלקוח מולך
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {payMode === "link" && (
              <div className="grid grid-cols-2 gap-4 items-center">
                <Label htmlFor="cc-channel">ערוץ שליחה</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as Channel)}
                >
                  <SelectTrigger id="cc-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both" disabled={!clientEmail || !clientPhone}>
                      מייל ו-SMS
                    </SelectItem>
                    <SelectItem value="email" disabled={!clientEmail}>
                      מייל בלבד
                    </SelectItem>
                    <SelectItem value="sms" disabled={!clientPhone}>
                      SMS בלבד
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {payMode === "link" && !clientEmail && !clientPhone && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  אין ללקוח מייל ולא טלפון — שלח לקוח מעודכן או בחר &quot;iframe&quot;.
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 py-2 px-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <Checkbox
                id="cc-save-card"
                checked={saveCard}
                onCheckedChange={(v) => setSaveCard(v === true)}
              />
              <Label htmlFor="cc-save-card" className="cursor-pointer">
                שמור כרטיס לחיובים עתידיים
              </Label>
            </div>
          </div>
        )}

        {step === "creating" && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">יוצר דף תשלום ב-Cardcom...</p>
          </div>
        )}

        {step === "link-sent" && (() => {
          const allFailed =
            linkResults.length > 0 && linkResults.every((r) => !r.success);
          return (
          <div className="space-y-4 py-2">
            <div
              className={
                allFailed
                  ? "border rounded-lg p-4 bg-amber-50 border-amber-300"
                  : "border rounded-lg p-4 bg-emerald-50 border-emerald-200"
              }
            >
              <div
                className={
                  allFailed
                    ? "flex items-center gap-2 font-bold text-amber-800 mb-2"
                    : "flex items-center gap-2 font-bold text-emerald-800 mb-2"
                }
              >
                {allFailed ? (
                  <AlertCircle className="h-5 w-5" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                {allFailed
                  ? "שליחה נכשלה — אבל הקישור נוצר"
                  : "קישור תשלום נשלח"}
              </div>
              <ul className="text-sm space-y-1">
                {linkResults.map((r) => (
                  <li
                    key={r.channel}
                    className={r.success ? "text-emerald-800" : "text-red-700"}
                  >
                    {r.channel === "sms" ? (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        SMS {r.success ? "נשלח" : `נכשל${r.error ? ` (${r.error})` : ""}`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        מייל {r.success ? "נשלח" : `נכשל${r.error ? ` (${r.error})` : ""}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {errorMessage && (
                <p className="text-xs text-amber-700 mt-2">{errorMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <Badge variant="secondary">ממתין לתשלום</Badge>
              <span className="text-muted-foreground">
                המסך יתעדכן אוטומטית כשהלקוח ישלם
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendLink}
                disabled={isResending || resendCooldownLeft > 0}
                title={
                  resendCooldownLeft > 0
                    ? "המתן לפני שליחה נוספת"
                    : undefined
                }
              >
                {isResending ? (
                  <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 ml-1" />
                )}
                {resendCooldownLeft > 0
                  ? `שלח שוב (${resendCooldownLeft}s)`
                  : "שלח שוב"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                העתק קישור
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(paymentPageUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4 ml-1" />
                פתח בכרטיסייה חדשה
              </Button>
            </div>
          </div>
          );
        })()}

        {step === "timeout" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-amber-600" />
            </div>
            <p className="font-bold text-amber-800 text-lg">לא קיבלנו עדיין אישור</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              ייתכן שהלקוח עדיין משלם או שהאישור יגיע בהמשך.<br />
              אם בוצע תשלום, הוא יופיע אוטומטית בהיסטוריית התשלומים.
            </p>
          </div>
        )}

        {step === "iframe" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <Badge variant="secondary">ממתין לתשלום</Badge>
            </div>
            <div className="border rounded-lg overflow-hidden bg-white">
              <iframe
                src={paymentPageUrl}
                title="Cardcom Payment"
                className="w-full"
                style={{ height: 600, border: 0 }}
                allow="payment"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              המסך יתעדכן אוטומטית בתום התשלום
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="h-9 w-9 text-emerald-600" />
            </div>
            <p className="font-bold text-emerald-700 text-lg">התשלום בוצע בהצלחה</p>
            <p className="text-sm text-muted-foreground">
              קבלה אוטומטית הופקה ונשלחה ללקוח
            </p>
          </div>
        )}

        {step === "failure" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <p className="font-bold text-red-700 text-lg">לא הצלחנו לבצע את התשלום</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {errorMessage || "אנא נסה שוב, או בחר שיטת תשלום אחרת"}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "setup" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                בטל
              </Button>
              <Button
                onClick={startCardcom}
                disabled={
                  payMode === "link" && validChannels.length === 0
                }
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CreditCard className="h-4 w-4 ml-1" />
                גבה ₪{amount}
              </Button>
            </>
          )}
          {(step === "link-sent" || step === "iframe") && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              סגור (ימשיך לעבוד ברקע)
            </Button>
          )}
          {step === "timeout" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              סגור
            </Button>
          )}
          {step === "failure" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                סגור
              </Button>
              <Button onClick={reset}>נסה שוב</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
