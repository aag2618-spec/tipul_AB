"use client";

// H4 שלב 2: UI לניהול 2FA — הפעלת/כיבוי TOTP.
// Flow:
//   1. המשתמש לוחץ "הפעל TOTP" → POST /api/auth/2fa/totp-setup → מקבל secret + QR
//   2. המשתמש סורק את ה-QR באפליקציית Authenticator
//   3. המשתמש מזין קוד 6-ספרות → PATCH /api/auth/2fa/totp-setup → שמירה ב-DB
//   4. ה-status מתעדכן ל-"TOTP פעיל" + כפתור "כבה" שדורש קוד תקף

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, Loader2, ShieldCheck, AlertTriangle, Key, Copy, Download, RefreshCw, Unlock } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

type Status = "loading" | "off" | "otp" | "totp";

export function SecurityTab() {
  const { update } = useSession();
  const [status, setStatus] = useState<Status>("loading");
  // Setup dialog state
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [setupQr, setSetupQr] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  // Disable dialog state
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);
  // H18: Recovery codes state
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [remainingCodes, setRemainingCodes] = useState<number | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  // כלי "שחרור תיק חסום" — טוגל אישי (נטפרי/אתרוג).
  const [usesContentFilter, setUsesContentFilter] = useState(false);
  const [filterSaving, setFilterSaving] = useState(false);

  // טעינת הסטטוס הנוכחי מ-/api/user/profile (existing endpoint)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) {
          if (!cancelled) setStatus("off");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.twoFactorMethod === "TOTP") setStatus("totp");
        else if (data.twoFactorEnabled) setStatus("otp");
        else setStatus("off");
        setUsesContentFilter(!!data.usesContentFilter);
      } catch {
        if (!cancelled) setStatus("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // H18: טעינת מספר קודי שחזור שנותרו — רק כשהמצב הוא TOTP.
  useEffect(() => {
    if (status !== "totp") {
      setRemainingCodes(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/2fa/recovery-codes");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRemainingCodes(typeof data.remaining === "number" ? data.remaining : 0);
      } catch {
        // לא קריטי — UI יציג "—" במקום מספר
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    const text = recoveryCodes.join("\n");
    void navigator.clipboard.writeText(text).then(
      () => toast.success("הקודים הועתקו"),
      () => toast.error("לא ניתן להעתיק. אנא בחר/י ידנית והעתק/י.")
    );
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes) return;
    const header = "MyTipul — קודי שחזור ל-2FA\n";
    const warning =
      "שמור/י את הקודים האלה במקום מאובטח (סיסמתון/הדפסה).\nכל קוד תקף לשימוש פעם אחת בלבד.\nאם איבדת את הטלפון, השתמש/י בקוד שחזור במקום קוד מהאפליקציה.\n\n";
    const body = recoveryCodes.join("\n");
    const blob = new Blob([header + warning + body + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mytipul-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function regenerateRecoveryCodes() {
    if (regenCode.length !== 6) {
      toast.error("הזן/י קוד בן 6 ספרות מהאפליקציה");
      return;
    }
    setRegenBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: regenCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה ביצירת קודים חדשים");
        return;
      }
      setRecoveryCodes(data.recoveryCodes);
      setRegenOpen(false);
      setRegenCode("");
      setRecoveryOpen(true);
      setRemainingCodes(data.recoveryCodes.length);
      toast.success("נוצרו קודי שחזור חדשים. הישנים בוטלו.");
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setRegenBusy(false);
    }
  }

  async function startSetup() {
    setSetupBusy(true);
    setSetupCode("");
    try {
      const res = await fetch("/api/auth/2fa/totp-setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה בהתחלת ההגדרה");
        return;
      }
      setSetupSecret(data.secret);
      setSetupQr(data.qrDataUrl);
      setSetupOpen(true);
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setSetupBusy(false);
    }
  }

  async function confirmSetup() {
    if (setupCode.length !== 6) {
      toast.error("הזן/י קוד בן 6 ספרות");
      return;
    }
    setSetupBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/totp-setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: setupSecret, code: setupCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "קוד שגוי");
        return;
      }
      toast.success("TOTP הופעל בהצלחה");
      setSetupOpen(false);
      setSetupSecret("");
      setSetupQr("");
      setSetupCode("");
      setStatus("totp");
      // H18: אם הוחזרו recovery codes, פותחים אוטומטית את דיאלוג הקודים.
      // המשתמש חייב לשמור אותם — לא יוצגו שוב!
      if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length > 0) {
        setRecoveryCodes(data.recoveryCodes);
        setRemainingCodes(data.recoveryCodes.length);
        setRecoveryOpen(true);
      }
      // refresh session — token מתעדכן
      await update();
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setSetupBusy(false);
    }
  }

  async function confirmDisable() {
    if (disableCode.length !== 6) {
      toast.error("הזן/י קוד בן 6 ספרות מהאפליקציה");
      return;
    }
    setDisableBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/totp-setup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "קוד שגוי");
        return;
      }
      toast.success("TOTP בוטל. חזרת ל-2FA במייל.");
      setDisableOpen(false);
      setDisableCode("");
      setStatus("otp");
      await update();
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setDisableBusy(false);
    }
  }

  // טוגל "אני משתמש/ת בסינון תוכן" — שמירה אופטימית ל-/api/user/profile.
  async function toggleContentFilter(next: boolean) {
    setFilterSaving(true);
    setUsesContentFilter(next);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usesContentFilter: next }),
      });
      if (!res.ok) {
        setUsesContentFilter(!next);
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "שמירה נכשלה");
        return;
      }
      // מעדכן את סרגל הצד בזמן אמת (הטאב מופיע/נעלם בלי רענון דף).
      window.dispatchEvent(
        new CustomEvent("content-filter-changed", { detail: next })
      );
      toast.success(
        next
          ? 'מצב סינון תוכן הופעל — הכלי "שחרור תיק חסום" יופיע בתפריט'
          : "מצב סינון תוכן כובה"
      );
    } catch {
      setUsesContentFilter(!next);
      toast.error("שגיאת רשת");
    } finally {
      setFilterSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            אימות דו-שלבי (2FA)
          </CardTitle>
          <CardDescription>
            שכבת הגנה נוספת על החשבון. במערכת רפואית עם חיסיון רפואי — מומלץ מאוד.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              טוען...
            </div>
          )}

          {status === "totp" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
                <div>
                  <div className="font-semibold">TOTP פעיל</div>
                  <div className="text-sm">
                    קודים מאפליקציית Authenticator. ההגנה הכי חזקה.
                  </div>
                </div>
              </div>

              {/* H18: סטטוס קודי שחזור */}
              <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                <Key className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="font-semibold text-sm">קודי שחזור</div>
                    <div className="text-xs text-muted-foreground">
                      {remainingCodes === null
                        ? "טוען..."
                        : remainingCodes === 0
                        ? "אין קודים זמינים. צור/י קודים חדשים — חיוני למקרה של אובדן טלפון."
                        : remainingCodes < 3
                        ? `נותרו ${remainingCodes} קודים בלבד. מומלץ לייצר קודים חדשים.`
                        : `נותרו ${remainingCodes} קודים זמינים לשימוש חד-פעמי.`}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRegenOpen(true)}
                  >
                    <RefreshCw className="ml-2 h-4 w-4" />
                    צור קודים חדשים
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => setDisableOpen(true)}
              >
                כבה TOTP
              </Button>
            </div>
          )}

          {(status === "otp" || status === "off") && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  {status === "otp"
                    ? "כרגע: קודי אימות נשלחים במייל/SMS. אפליקציית Authenticator (כמו Google Authenticator) מאובטחת יותר ופועלת גם בלי קליטה."
                    : "אימות דו-שלבי לא פעיל. מומלץ להפעיל TOTP כדי להגן על החשבון."}
                </div>
              </div>
              <Button onClick={startSetup} disabled={setupBusy}>
                {setupBusy ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    טוען...
                  </>
                ) : (
                  "הפעל אפליקציית Authenticator"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* כלי "שחרור תיק חסום" — סינון תוכן (נטפרי/אתרוג) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5" />
            סינון תוכן (נטפרי / אתרוג)
          </CardTitle>
          <CardDescription>
            אם את/ה משתמש/ת בסינון תוכן שעלול לחסום תיק מטופל בגלל מילים שנכתבו
            בסיכום, הפעלת המצב הזה תוסיף לתפריט את הכלי &quot;שחרור תיק חסום&quot; —
            שמאפשר למחוק סיכום וניתוח AI של פגישה ספציפית מבלי להיכנס לתיק.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="content-filter-switch">
                אני משתמש/ת בסינון תוכן (נטפרי/אתרוג)
              </Label>
              <p className="text-xs text-muted-foreground">
                מציג בתפריט את הכלי &quot;שחרור תיק חסום&quot;.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {filterSaving && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Switch
                id="content-filter-switch"
                checked={usesContentFilter}
                onCheckedChange={toggleContentFilter}
                disabled={filterSaving}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup dialog */}
      <Dialog open={setupOpen} onOpenChange={(o) => !setupBusy && setSetupOpen(o)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הפעלת אפליקציית Authenticator</DialogTitle>
            <DialogDescription>
              סרוק/י את קוד ה-QR עם Google Authenticator, Authy, או 1Password.
              ואז הזן/י את הקוד בן 6 הספרות שמופיע באפליקציה.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {setupQr && (
              <div className="flex justify-center">
                <Image
                  src={setupQr}
                  alt="QR code"
                  width={240}
                  height={240}
                  unoptimized
                />
              </div>
            )}
            <div className="rounded-md bg-muted p-3 text-xs font-mono break-all">
              <div className="font-semibold mb-1">לא יכול/ה לסרוק? הזן/י ידנית:</div>
              {setupSecret}
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-code">קוד בן 6 ספרות מהאפליקציה</Label>
              <Input
                id="setup-code"
                inputMode="numeric"
                maxLength={6}
                value={setupCode}
                onChange={(e) =>
                  setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSetupOpen(false)}
              disabled={setupBusy}
            >
              ביטול
            </Button>
            <Button onClick={confirmSetup} disabled={setupBusy || setupCode.length !== 6}>
              {setupBusy ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מאמת...
                </>
              ) : (
                "הפעל"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* H18: Recovery codes display dialog — מוצג פעם אחת אחרי הפעלה/regen */}
      <Dialog
        open={recoveryOpen}
        onOpenChange={(o) => {
          // לא מאפשרים סגירה בלחיצה מחוץ אם הקודים עוד לא הועתקו —
          // יציאה רק דרך כפתור "סגור" כדי לוודא שהמשתמש שמר
          if (!o) {
            setRecoveryOpen(false);
            // מנקים את הקודים מ-state כדי שלא יהיו בזיכרון יותר מהנדרש
            setTimeout(() => setRecoveryCodes(null), 300);
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-600" />
              קודי שחזור — שמור/י עכשיו!
            </DialogTitle>
            <DialogDescription>
              הקודים האלה יוצגו <strong>פעם אחת בלבד</strong>. שמור/י אותם במקום מאובטח —
              סיסמתון, מנהל סיסמאות, או הדפסה. ללא הקודים, אם תאבד/י את הטלפון —
              לא תוכל/י להיכנס לחשבון.
            </DialogDescription>
          </DialogHeader>
          {recoveryCodes && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-4 grid grid-cols-2 gap-2 font-mono text-sm">
                {recoveryCodes.map((c, i) => (
                  <div
                    key={i}
                    className="px-2 py-1 bg-background rounded border text-center select-all"
                  >
                    {c}
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-800 dark:text-amber-200 text-xs">
                <strong>חשוב:</strong> כל קוד תקף לשימוש פעם אחת בלבד. אם תייצר/י קודים חדשים,
                כל הקודים הישנים יבוטלו אוטומטית.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyRecoveryCodes} className="flex-1">
                  <Copy className="ml-2 h-4 w-4" />
                  העתק/י
                </Button>
                <Button variant="outline" size="sm" onClick={downloadRecoveryCodes} className="flex-1">
                  <Download className="ml-2 h-4 w-4" />
                  הורד/י קובץ
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setRecoveryOpen(false);
                setTimeout(() => setRecoveryCodes(null), 300);
              }}
            >
              שמרתי את הקודים — סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* H18: Regenerate recovery codes dialog */}
      <Dialog open={regenOpen} onOpenChange={(o) => !regenBusy && setRegenOpen(o)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>יצירת קודי שחזור חדשים</DialogTitle>
            <DialogDescription>
              <strong>שים/י לב:</strong> יצירת קודים חדשים תבטל את כל הקודים הקיימים.
              הזן/י קוד תקף מאפליקציית האימות לאישור.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="regen-code">קוד בן 6 ספרות מהאפליקציה</Label>
            <Input
              id="regen-code"
              inputMode="numeric"
              maxLength={6}
              value={regenCode}
              onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegenOpen(false)} disabled={regenBusy}>
              ביטול
            </Button>
            <Button
              onClick={regenerateRecoveryCodes}
              disabled={regenBusy || regenCode.length !== 6}
            >
              {regenBusy ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  יוצר...
                </>
              ) : (
                "צור קודים חדשים"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <Dialog open={disableOpen} onOpenChange={(o) => !disableBusy && setDisableOpen(o)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>כיבוי TOTP</DialogTitle>
            <DialogDescription>
              לאישור, הזן/י קוד תקף מאפליקציית האימות. לאחר הכיבוי תחזור/י ל-2FA במייל.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="disable-code">קוד בן 6 ספרות מהאפליקציה</Label>
            <Input
              id="disable-code"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDisableOpen(false)}
              disabled={disableBusy}
            >
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDisable}
              disabled={disableBusy || disableCode.length !== 6}
            >
              {disableBusy ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מאמת...
                </>
              ) : (
                "כבה TOTP"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
