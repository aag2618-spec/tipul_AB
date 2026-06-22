"use client";

import { useState } from "react";
import { MessageSquare, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeIsraeliPhone } from "@/lib/booking-core";

interface ContactActionsProps {
  /**
   * מזהה המטופל — נדרש לשליחה (SMS/מייל מתבצעים בשרת לפי clientId + scope).
   * אופציונלי בחתימה לתאימות לאחור: בלי clientId הרכיב לא מציג כפתורים (guard
   * למטה), כדי שקוראים ישנים שעדיין לא חוּוטו לא ישברו את ה-build.
   */
  clientId?: string;
  clientName?: string | null;
  phone?: string | null;
  email?: string | null;
  /** גודל האייקונים. ברירת מחדל "sm". */
  size?: "sm" | "md";
}

// Pulseem חותך ל-201 תווים בעברית — תואם ל-cap בשרת (/api/sms/send).
const SMS_MAX = 201;
const EMAIL_SUBJECT_MAX = 200;

// אימייל "נקי" בלבד — חייב להכיל @ ונקודה, בלי רווחים/תווי-הזרקה. רק קובע אם
// להציג את כפתור המייל; האימות האמיתי + ה-scope נעשים בשרת מול ה-DB.
const SAFE_EMAIL_RE = /^[^\s@,?&<>"']+@[^\s@,?&<>"']+\.[^\s@,?&<>"']+$/;

// תבניות מהירות — ממלאות את החלון, וניתן לערוך אותן חופשי לפני שליחה.
// SMS נשלח כפי שהוא, ולכן התבנית כוללת ברכה. מייל נעטף אוטומטית בברכה+חתימה
// (createGenericEmail), ולכן גוף תבנית המייל בלי "שלום"/"בברכה" (לא לכפול).
const SMS_TEMPLATES: { label: string; build: (nm: string) => string }[] = [
  {
    label: "תזכורת לפגישה",
    build: (nm) =>
      `שלום${nm ? " " + nm : ""}, תזכורת לפגישתך הקרובה. נשמח לראותך! אם חל שינוי אנא עדכנו אותנו מראש.`,
  },
  {
    label: "בקשה לחזור אליי",
    build: (nm) =>
      `שלום${nm ? " " + nm : ""}, אנא חזרו אליי בהקדם בנוגע לפגישתך. תודה רבה.`,
  },
  {
    label: "קביעת פגישה",
    build: (nm) =>
      `שלום${nm ? " " + nm : ""}, נשמח לקבוע מועד לפגישה. אנא חזרו אליי לתיאום. תודה.`,
  },
];
const EMAIL_TEMPLATES: { label: string; subject: string; body: string }[] = [
  {
    label: "תזכורת לפגישה",
    subject: "תזכורת לפגישה",
    body: "תזכורת לפגישתך הקרובה אצלנו. נשמח לראותך. אם יש צורך בשינוי מועד, אנא עדכנו אותנו מראש.",
  },
  {
    label: "בקשה ליצירת קשר",
    subject: "בקשה ליצירת קשר",
    body: "אנא צרו עמי קשר בהקדם בנוגע לפגישתך. ניתן להשיב למייל זה או להתקשר. תודה.",
  },
  {
    label: "קביעת פגישה",
    subject: "קביעת פגישה",
    body: "נשמח לקבוע עמך מועד לפגישה. אנא חזרו אליי לתיאום מועד נוח. תודה.",
  },
];

/**
 * כפתורי יצירת-קשר מהירים למטופל: SMS ו-אימייל — שניהם נשלחים *דרך המערכת*
 * (לא דרך אפליקציות המכשיר), כדי שכל התכתבות תירשם ביומן ההודעות. SMS מנוכה
 * מחבילת ה-SMS של המטפל שהמטופל שייך אליו; מייל נשלח דרך הספק. כל כפתור מוצג
 * רק אם הנתון קיים ותקין. משותף למוקד/יומן/חיפוש מהיר/בקשות ביטול/רשימת המתנה.
 * `stopPropagation` כדי שלא להפעיל את לחיצת השורה שמסביב.
 */
export function ContactActions({
  clientId,
  clientName,
  phone,
  email,
  size = "sm",
}: ContactActionsProps) {
  const norm = phone ? normalizeIsraeliPhone(phone) : null;
  const trimmedEmail = email?.trim() || "";
  const mail = SAFE_EMAIL_RE.test(trimmedEmail) ? trimmedEmail : null;

  const [mode, setMode] = useState<null | "sms" | "email">(null);
  const [sending, setSending] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // בלי clientId אי-אפשר לשלוח (השרת מזהה את המטופל לפיו) — לא מציגים כלום.
  if (!clientId || (!norm && !mail)) return null;

  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const box = size === "md" ? "h-8 w-8" : "h-7 w-7";
  const who = clientName?.trim() || "המטופל/ת";
  const nm = clientName?.trim() || "";

  const closeDialog = () => {
    if (sending) return;
    setMode(null);
  };

  const handleSendSms = async () => {
    const msg = smsText.trim();
    if (!msg) {
      toast.error("יש לכתוב הודעה");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, message: msg }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("ה-SMS נשלח");
        setSmsText("");
        setMode(null);
      } else if (data.shabbatBlocked) {
        toast.warning(data.message || "ההודעה לא נשלחה — שבת/חג");
      } else {
        toast.error(data.message || "שליחת ה-SMS נכשלה");
      }
    } catch {
      toast.error("שגיאה ברשת — נסה/י שוב");
    } finally {
      setSending(false);
    }
  };

  const handleSendEmail = async () => {
    const sub = subject.trim();
    const cont = body.trim();
    if (!sub) {
      toast.error("יש לכתוב נושא");
      return;
    }
    if (!cont) {
      toast.error("יש לכתוב תוכן");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, subject: sub, content: cont }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("המייל נשלח");
        setSubject("");
        setBody("");
        setMode(null);
      } else {
        toast.error(data.message || "שליחת המייל נכשלה");
      }
    } catch {
      toast.error("שגיאה ברשת — נסה/י שוב");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <span
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {norm && (
          <button
            type="button"
            onClick={() => setMode("sms")}
            title="שליחת SMS"
            aria-label="שליחת SMS"
            className={`${box} flex items-center justify-center rounded-md border text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors`}
          >
            <MessageSquare className={icon} aria-hidden />
          </button>
        )}
        {mail && (
          <button
            type="button"
            onClick={() => setMode("email")}
            title="שליחת אימייל"
            aria-label="שליחת אימייל"
            className={`${box} flex items-center justify-center rounded-md border text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors`}
          >
            <Mail className={icon} aria-hidden />
          </button>
        )}
      </span>

      {/* חלון שליחת SMS */}
      <Dialog open={mode === "sms"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>שליחת SMS ל{who}</DialogTitle>
            <DialogDescription>
              ההודעה תישלח דרך המערכת ותנוכה מחבילת ה-SMS. לא נשלח בשבת/חג.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground ml-1">תבניות:</span>
              {SMS_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setSmsText(t.build(nm).slice(0, SMS_MAX))}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Textarea
              value={smsText}
              onChange={(e) => setSmsText(e.target.value.slice(0, SMS_MAX))}
              maxLength={SMS_MAX}
              rows={4}
              placeholder="כתוב/י את ההודעה, או בחר/י תבנית מהירה למעלה..."
              dir="rtl"
              autoFocus
            />
            <div className="text-xs text-muted-foreground text-left">
              {smsText.length}/{SMS_MAX}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={sending}>
              ביטול
            </Button>
            <Button onClick={handleSendSms} disabled={sending || !smsText.trim()}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  שולח...
                </>
              ) : (
                "שליחה"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* חלון שליחת אימייל */}
      <Dialog open={mode === "email"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>שליחת אימייל ל{who}</DialogTitle>
            <DialogDescription>
              המייל יישלח דרך המערכת וירשם ביומן ההודעות.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground ml-1">תבניות:</span>
              {EMAIL_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => {
                    setSubject(t.subject.slice(0, EMAIL_SUBJECT_MAX));
                    setBody(t.body);
                  }}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact-email-subject">נושא</Label>
              <Input
                id="contact-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, EMAIL_SUBJECT_MAX))}
                maxLength={EMAIL_SUBJECT_MAX}
                placeholder="נושא ההודעה"
                dir="rtl"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact-email-body">תוכן</Label>
              <Textarea
                id="contact-email-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="כתוב/י את תוכן ההודעה..."
                dir="rtl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={sending}>
              ביטול
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sending || !subject.trim() || !body.trim()}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  שולח...
                </>
              ) : (
                "שליחה"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
