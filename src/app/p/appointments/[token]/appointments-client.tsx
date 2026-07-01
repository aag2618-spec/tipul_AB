"use client";

// AppointmentsClient — זרימת "הפגישות שלי": GET ראשוני → אם דרוש אימות, שליחת
// קוד + הזנה → רשימת פגישות עם כפתור "בקש ביטול" (סיבה אופציונלית). עיצוב עצמאי
// (inline styles) כמו שאר עמודי /p — בלי מעטפת האפליקציה.

import { useCallback, useEffect, useState } from "react";

type Appointment = {
  id: string;
  startTime: string;
  therapistName: string;
  pending: boolean;
  cancellable: boolean;
  chargeable: boolean;
};

type Meta = {
  therapistName: string;
  verified?: boolean;
  requiresVerification?: boolean;
  otpChannel?: "email" | "sms" | null;
  destinationMasked?: string | null;
  appointments?: Appointment[];
  freeCancellationHours?: number;
  cancellationDisabled?: boolean;
  shabbatBlocked?: boolean;
  shabbatMessage?: string;
  message?: string;
  accessError?: string;
};

const ACCENT = "#0f766e";
const MAX_REASON_WORDS = 200; // תואם לאכיפה בשרת (route.ts)

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
}

export function AppointmentsClient({ token }: { token: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  // OTP
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Cancel
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const reasonWords = countWords(reason);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/p/appointments/${token}`, { cache: "no-store" });
      const data: Meta = await res.json();
      if (!res.ok && !data.shabbatBlocked) {
        setFatal(data.message || "אירעה שגיאה");
        setMeta(data);
        return;
      }
      setMeta(data);
    } catch {
      setFatal("אירעה שגיאה בטעינה. נא לנסות שוב.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const sendOtp = async () => {
    setSending(true);
    setNotice(null);
    setOtpError(null);
    try {
      const res = await fetch(`/api/p/appointments/${token}?action=send-otp`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || "שליחת הקוד נכשלה");
        return;
      }
      setOtpSent(true);
      setNotice(`קוד נשלח אל ${data.destinationMasked || "פרטי הקשר שלך"}`);
    } catch {
      setOtpError("שליחת הקוד נכשלה. נא לנסות שוב.");
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (otp.trim().length !== 6) {
      setOtpError("קוד אימות חייב להיות 6 ספרות");
      return;
    }
    setVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/p/appointments/${token}?action=verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || "קוד שגוי");
        return;
      }
      setOtp("");
      setOtpSent(false);
      await load(); // מרענן — עכשיו verified=true עם הפגישות
    } catch {
      setOtpError("אירעה שגיאה. נא לנסות שוב.");
    } finally {
      setVerifying(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/p/appointments/${token}?action=cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: cancelId, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDone(data.message || "הביטול נכשל");
      } else {
        setDone(data.message || "בקשת הביטול נשלחה.");
      }
      setCancelId(null);
      setReason("");
      await load();
    } catch {
      setDone("אירעה שגיאה. נא לנסות שוב.");
      setCancelId(null);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <Shell><p style={{ color: "#666" }}>טוען…</p></Shell>;
  }

  if (meta?.shabbatBlocked) {
    return (
      <Shell title="שבת שלום" accent="#7c3aed">
        <p>{meta.shabbatMessage || "המערכת סגורה בשבת ובחגים. ניתן לנסות במוצאי שבת/חג."}</p>
      </Shell>
    );
  }

  // מדיניות המטפל/ת אינה מאפשרת ביטול אונליין — מסך מכובד ומפנה ליצירת קשר.
  if (meta?.cancellationDisabled) {
    return (
      <Shell title="ביטול תור" subtitle={`אצל ${meta.therapistName}`}>
        <p>{meta.message}</p>
      </Shell>
    );
  }

  if (fatal) {
    return (
      <Shell title="לא ניתן להציג" accent="#b91c1c">
        <p>{fatal}</p>
      </Shell>
    );
  }

  // דרוש אימות
  if (meta && !meta.verified) {
    return (
      <Shell title="הפגישות שלי" subtitle={`אצל ${meta.therapistName}`}>
        <p style={{ marginBottom: 16 }}>
          לצפייה בפגישות ולביטול, נא לאמת שזה אתה. נשלח קוד חד-פעמי
          {meta.otpChannel === "email" ? " למייל" : meta.otpChannel === "sms" ? " ב-SMS" : ""}.
        </p>
        {notice && <Banner tone="info">{notice}</Banner>}
        {otpError && <Banner tone="error">{otpError}</Banner>}
        {!otpSent ? (
          <button style={btn()} disabled={sending} onClick={sendOtp}>
            {sending ? "שולח…" : "שלח לי קוד אימות"}
          </button>
        ) : (
          <>
            <input
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="הזן קוד בן 6 ספרות"
              style={input()}
              dir="ltr"
            />
            <button style={btn()} disabled={verifying} onClick={verify}>
              {verifying ? "מאמת…" : "אישור"}
            </button>
            <button style={linkBtn()} disabled={sending} onClick={sendOtp}>
              שליחת קוד חדש
            </button>
          </>
        )}
      </Shell>
    );
  }

  // מאומת — רשימת פגישות
  const appts = meta?.appointments || [];
  const freeH = meta?.freeCancellationHours;
  const selected = appts.find((a) => a.id === cancelId) || null;
  const selectedChargeable = !!selected?.chargeable;
  return (
    <Shell title="הפגישות שלי" subtitle={`אצל ${meta?.therapistName}`}>
      {done && <Banner tone="info">{done}</Banner>}
      {freeH ? (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: -4, marginBottom: 16 }}>
          ביטול עד {freeH} שעות לפני הפגישה — ללא תשלום. קרוב יותר לפגישה, הביטול עשוי להיות כרוך בתשלום.
        </p>
      ) : null}
      {appts.length === 0 ? (
        <p style={{ color: "#666" }}>אין פגישות עתידיות.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {appts.map((a) => (
            <div key={a.id} style={card()}>
              <div style={{ fontWeight: 600 }}>{fmt(a.startTime)}</div>
              <div style={{ fontSize: 14, color: "#666", marginTop: 4 }}>{a.therapistName}</div>
              {a.pending ? (
                <div style={{ marginTop: 10, fontSize: 13, color: "#b45309" }}>
                  בקשת ביטול כבר ממתינה לאישור
                </div>
              ) : (
                <>
                  {a.chargeable && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#b45309" }}>
                      ⚠ ביטול כעת עשוי להיות כרוך בתשלום
                    </div>
                  )}
                  <button
                    style={{ ...btn(), marginTop: 10, background: "#fff", color: "#b91c1c", border: "1px solid #fca5a5" }}
                    onClick={() => { setCancelId(a.id); setReason(""); }}
                  >
                    בקש ביטול
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {cancelId && (
        <div style={overlay()}>
          <div style={{ ...shellBox(), maxWidth: 400 }}>
            <h2 style={{ marginTop: 0, fontSize: 20, color: ACCENT }}>בקשת ביטול</h2>
            {selectedChargeable ? (
              <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#92400e", marginBottom: 12 }}>
                שים/י לב: לפי מדיניות הביטול{freeH ? ` (ביטול חינם עד ${freeH} שעות לפני)` : ""}, ביטול במועד זה עשוי להיות כרוך בתשלום. ניתן להמשיך — הבקשה תישלח למטפל/ת לאישור.
              </div>
            ) : (
              <p style={{ color: "#374151" }}>
                {freeH ? `ביטול עד ${freeH} שעות לפני הפגישה — ללא תשלום. ` : ""}הבקשה תישלח למטפל/ת לאישור, ותקבל/י עדכון.
              </p>
            )}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="סיבת הביטול (אופציונלי)"
              rows={3}
              style={{ ...input(), resize: "none", textAlign: "right", marginBottom: 4 }}
            />
            <div style={{ fontSize: 12, textAlign: "left", marginBottom: 8, color: reasonWords > MAX_REASON_WORDS ? "#b91c1c" : "#9ca3af" }}>
              {reasonWords}/{MAX_REASON_WORDS} מילים
            </div>
            <button
              style={{ ...btn(), background: "#b91c1c", opacity: reasonWords > MAX_REASON_WORDS ? 0.6 : 1 }}
              disabled={cancelling || reasonWords > MAX_REASON_WORDS}
              onClick={confirmCancel}
            >
              {cancelling
                ? "שולח…"
                : reasonWords > MAX_REASON_WORDS
                  ? `יותר מ-${MAX_REASON_WORDS} מילים`
                  : selectedChargeable
                    ? "המשך/י בביטול"
                    : "שלח בקשת ביטול"}
            </button>
            <button style={linkBtn()} disabled={cancelling} onClick={() => setCancelId(null)}>
              חזרה
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ─── UI helpers (inline styles, RTL) ────────────────────────────────────────
function Shell({
  title,
  subtitle,
  accent = ACCENT,
  children,
}: {
  title?: string;
  subtitle?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div dir="rtl" style={{ minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, background: "#f9fafb" }}>
      <div style={{ ...shellBox(), marginTop: 40 }}>
        {title && <h1 style={{ color: accent, marginTop: 0, fontSize: 24, marginBottom: subtitle ? 4 : 16 }}>{title}</h1>}
        {subtitle && <div style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>{subtitle}</div>}
        <div style={{ color: "#374151", fontSize: 16, lineHeight: 1.6 }}>{children}</div>
        <div style={{ marginTop: 24, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>מופעל על ידי MyTipul</div>
      </div>
    </div>
  );
}

function shellBox(): React.CSSProperties {
  return { background: "white", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "32px 28px", maxWidth: 480, width: "100%" };
}
function btn(): React.CSSProperties {
  return { display: "block", width: "100%", background: ACCENT, color: "white", border: "none", borderRadius: 8, padding: "12px 16px", fontSize: 16, fontWeight: 600, cursor: "pointer", marginTop: 8 };
}
function linkBtn(): React.CSSProperties {
  return { display: "block", width: "100%", background: "transparent", color: "#6b7280", border: "none", padding: "10px", fontSize: 14, cursor: "pointer", marginTop: 4 };
}
function input(): React.CSSProperties {
  return { display: "block", width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "12px 14px", fontSize: 18, marginBottom: 8, textAlign: "center" };
}
function card(): React.CSSProperties {
  return { border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff" };
}
function overlay(): React.CSSProperties {
  return { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 };
}
function Banner({ tone, children }: { tone: "info" | "error"; children: React.ReactNode }) {
  const bg = tone === "error" ? "#fef2f2" : "#f0fdfa";
  const color = tone === "error" ? "#b91c1c" : "#0f766e";
  const border = tone === "error" ? "#fca5a5" : "#5eead4";
  return <div style={{ background: bg, color, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, marginBottom: 12 }}>{children}</div>;
}
