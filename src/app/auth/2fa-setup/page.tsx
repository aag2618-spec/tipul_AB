"use client";

// force-setup gate (2026-06-29): דף הקמת 2FA כפוי. משתמש (כל תפקיד) שאין לו
// 2FA מופעל מופנה לכאן ע"י ה-proxy ולא יכול להגיע למסכים האמיתיים עד שיפעיל.
//
// הדף משתמש אך ורק בנתיבים שפטורים מה-proxy (/api/auth/2fa/*), כך שהוא נגיש
// גם כשהדגל requires2FASetup דלוק. **לא** קורא ל-/api/user/profile (חסום בשער).
//
// שני מסלולים:
//   • מייל/SMS (ראשי) — מתאים גם למי שאין לו טלפון חכם: קוד נשלח למייל.
//     POST /api/auth/2fa/email-setup (שליחה) → PATCH (אישור).
//   • אפליקציית Authenticator (TOTP) — POST /api/auth/2fa/totp-setup (secret+QR)
//     → PATCH (אישור) → הצגת קודי שחזור פעם אחת.
//
// אחרי הפעלה: sessionVersion עולה (ב-setup route) → sessionStale → ממילא יידרש
// login מחדש. לכן בסיום מפנים ל-/login עם הודעה ידידותית.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { handleLogout } from "@/lib/logout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppLogo } from "@/components/app-logo";
import {
  Loader2,
  Shield,
  Mail,
  Smartphone,
  ArrowRight,
  Key,
  Copy,
  Download,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type Mode = "choose" | "email" | "totp";

export default function TwoFactorSetupPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [mode, setMode] = useState<Mode>("choose");

  // מצב משותף
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // מסלול TOTP
  const [totpSecret, setTotpSecret] = useState("");
  const [totpQr, setTotpQr] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // הפניה אם לא מחובר
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // אם המשתמש כבר עם 2FA (אין צורך בהקמה) → דשבורד.
  // לא יורה אחרי הפעלה מקומית כי לא קוראים ל-update() — מפנים ידנית ל-/login.
  useEffect(() => {
    if (
      status === "authenticated" &&
      session?.user &&
      session.user.requires2FASetup === false
    ) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  // ניקוי שדה הקוד והשגיאה במעבר בין מסלולים
  function goTo(next: Mode) {
    setCode("");
    setError("");
    setMode(next);
  }

  // ===== מסלול מייל/SMS =====
  async function sendEmailCode() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/email-setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.shabbatBlocked) {
          setError(
            "לא ניתן לשלוח קוד בשבת/חג. אפשר להפעיל עכשיו דרך אפליקציית Authenticator, או לחזור במוצאי השבת/החג."
          );
        } else if (res.status === 429) {
          setError("יותר מדי בקשות. אנא נסה/י שוב בעוד מספר דקות.");
        } else {
          setError(data.message || "שגיאה בשליחת הקוד");
        }
        return;
      }
      goTo("email");
      toast.success("קוד אימות נשלח למייל שלך (וגם ב-SMS אם יש טלפון שמור)");
    } catch {
      setError("שגיאת רשת. אנא נסה/י שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail() {
    if (code.length !== 6) {
      setError("אנא הזן/י קוד בן 6 ספרות");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/email-setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "קוד שגוי או שפג תוקפו");
        return;
      }
      finishAndRelogin("האימות הדו-שלבי הופעל בהצלחה. אנא התחבר/י מחדש להשלמה.");
    } catch {
      setError("שגיאת רשת. אנא נסה/י שוב.");
    } finally {
      setBusy(false);
    }
  }

  // ===== מסלול TOTP =====
  async function startTotp() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/totp-setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "שגיאה בהתחלת ההגדרה");
        return;
      }
      setTotpSecret(data.secret);
      setTotpQr(data.qrDataUrl);
      goTo("totp");
    } catch {
      setError("שגיאת רשת. אנא נסה/י שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp() {
    if (code.length !== 6) {
      setError("אנא הזן/י קוד בן 6 ספרות");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/totp-setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: totpSecret, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "קוד שגוי. נסה/י שוב או סרוק/י מחדש את ה-QR.");
        return;
      }
      // קודי שחזור מוצגים פעם אחת בלבד — עוצרים כדי שהמשתמש ישמור.
      if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length > 0) {
        setRecoveryCodes(data.recoveryCodes);
        toast.success("TOTP הופעל. שמור/י את קודי השחזור!");
      } else {
        finishAndRelogin("האימות הדו-שלבי הופעל בהצלחה. אנא התחבר/י מחדש להשלמה.");
      }
    } catch {
      setError("שגיאת רשת. אנא נסה/י שוב.");
    } finally {
      setBusy(false);
    }
  }

  // ===== סיום =====
  // לא קוראים ל-update() — sessionVersion עלה ולכן ה-token התיישן; ה-proxy
  // ממילא יפנה ל-/login. ניווט קשיח כדי לשלוח את ה-cookie הנוכחי ולקבל הפניה נקייה.
  function finishAndRelogin(message: string) {
    toast.success(message, { duration: 6000 });
    window.location.assign("/login?setup=2fa_done");
  }

  function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    void navigator.clipboard.writeText(recoveryCodes.join("\n")).then(
      () => toast.success("הקודים הועתקו"),
      () => toast.error("לא ניתן להעתיק. אנא בחר/י ידנית והעתק/י.")
    );
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes) return;
    const header = "MyTipul — קודי שחזור ל-2FA\n";
    const warning =
      "שמור/י את הקודים במקום מאובטח (סיסמתון/הדפסה).\nכל קוד תקף לשימוש פעם אחת בלבד.\nאם איבדת את הטלפון, השתמש/י בקוד שחזור במקום קוד מהאפליקציה.\n\n";
    const blob = new Blob([header + warning + recoveryCodes.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mytipul-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      <Card className="w-full max-w-md animate-fade-in relative">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex justify-center">
            <AppLogo width={344} height={192} className="h-14 w-auto object-contain" priority />
          </div>
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Shield className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">הפעלת אימות דו-שלבי</CardTitle>
            <CardDescription className="mt-2">
              לאבטחת המידע הרפואי, יש להפעיל אימות דו-שלבי לפני הכניסה למערכת.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center animate-fade-in">
              {error}
            </div>
          )}

          {/* ===== מסך קודי שחזור (אחרי TOTP) ===== */}
          {recoveryCodes ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-5 w-5 shrink-0" />
                <div className="text-sm font-semibold">
                  אפליקציית Authenticator הופעלה
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                <Key className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="text-xs text-muted-foreground">
                  הקודים האלה יוצגו <strong>פעם אחת בלבד</strong>. שמור/י אותם במקום
                  מאובטח — אם תאבד/י את הטלפון, זו הדרך היחידה להיכנס.
                </div>
              </div>
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
          ) : mode === "choose" ? (
            /* ===== בחירת שיטה ===== */
            <div className="space-y-3">
              <button
                type="button"
                onClick={sendEmailCode}
                disabled={busy}
                className="w-full flex items-center gap-3 rounded-lg border p-4 text-right transition-colors hover:bg-accent/50 disabled:opacity-60"
              >
                <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">קוד במייל / SMS</div>
                  <div className="text-xs text-muted-foreground">
                    מתאים לכולם, גם בלי טלפון חכם. קוד יישלח למייל שלך.
                  </div>
                </div>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              <button
                type="button"
                onClick={startTotp}
                disabled={busy}
                className="w-full flex items-center gap-3 rounded-lg border p-4 text-right transition-colors hover:bg-accent/50 disabled:opacity-60"
              >
                <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">אפליקציית Authenticator</div>
                  <div className="text-xs text-muted-foreground">
                    ההגנה החזקה ביותר, פועלת גם בלי קליטה. דורשת סמארטפון עם סורק QR.
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : mode === "email" ? (
            /* ===== אישור קוד מייל ===== */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                שלחנו קוד בן 6 ספרות למייל שלך (וגם ב-SMS, אם יש טלפון נייד שמור).
              </p>
              <div className="space-y-2">
                <Label htmlFor="email-code">קוד אימות</Label>
                <Input
                  id="email-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={busy}
                  autoFocus
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="------"
                  dir="ltr"
                />
              </div>
              <Button onClick={confirmEmail} disabled={busy || code.length !== 6} className="w-full">
                {busy ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    מאמת...
                  </>
                ) : (
                  "הפעל אימות דו-שלבי"
                )}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline disabled:opacity-50 w-full text-center"
                onClick={sendEmailCode}
                disabled={busy}
              >
                לא קיבלת? שלח/י קוד חדש
              </button>
            </div>
          ) : (
            /* ===== הגדרת TOTP ===== */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                סרוק/י את קוד ה-QR עם Google Authenticator, Authy או 1Password, ואז
                הזן/י את הקוד בן 6 הספרות שמופיע באפליקציה.
              </p>
              {totpQr && (
                <div className="flex justify-center">
                  <Image src={totpQr} alt="קוד QR לאפליקציית האימות" width={200} height={200} unoptimized />
                </div>
              )}
              {totpSecret && (
                <div className="rounded-md bg-muted p-3 text-xs font-mono break-all">
                  <div className="font-semibold mb-1">לא יכול/ה לסרוק? הזן/י ידנית:</div>
                  {totpSecret}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="totp-code">קוד בן 6 ספרות מהאפליקציה</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={busy}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="------"
                  dir="ltr"
                />
              </div>
              <Button onClick={confirmTotp} disabled={busy || code.length !== 6} className="w-full">
                {busy ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    מאמת...
                  </>
                ) : (
                  "הפעל אימות דו-שלבי"
                )}
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {/* כפתור חזרה לבחירת שיטה — לא מוצג במסך קודי השחזור (חובה לשמור קודם) */}
          {!recoveryCodes && mode !== "choose" && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setTotpSecret("");
                setTotpQr("");
                goTo("choose");
              }}
              disabled={busy}
            >
              בחירת שיטה אחרת
            </Button>
          )}

          {recoveryCodes && (
            <Button
              className="w-full"
              onClick={() =>
                finishAndRelogin("האימות הדו-שלבי הופעל. אנא התחבר/י מחדש להשלמה.")
              }
            >
              שמרתי את הקודים — המשך
            </Button>
          )}

          <Button
            type="button"
            variant="link"
            className="text-sm text-muted-foreground"
            onClick={() => handleLogout()}
          >
            התחבר עם משתמש אחר
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
