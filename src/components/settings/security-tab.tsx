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
import { Shield, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
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
      } catch {
        if (!cancelled) setStatus("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
