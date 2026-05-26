"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

const RESEND_COOLDOWN_SECONDS = 30;
const CODE_LENGTH = 6;

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [codeSent, setCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [shabbatBlocked, setShabbatBlocked] = useState(false);
  // H4: TOTP mode — לא שולחים מייל/SMS, המשתמש מקבל קוד מהאפליקציה.
  const [isTotpMode, setIsTotpMode] = useState(false);
  // H18: recovery mode — המשתמש בחר להשתמש בקוד שחזור (10 תווים) במקום TOTP (6 ספרות)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  // אם המשתמש לא מחובר → הפניה ל-login
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // אם המשתמש כבר אומת (requires2FA=false) → הפניה ל-dashboard
  useEffect(() => {
    if (status === "authenticated" && session?.user && !session.user.requires2FA) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  // שליחת קוד אוטומטית בכניסה ראשונה לדף.
  // לא שולחים שוב אם נחסם בשבת/חג — מונע auto-resend loop.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email && !codeSent && !shabbatBlocked) {
      void sendCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.email]);

  // טיימר cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function sendCode() {
    if (!session?.user?.email) return;
    setIsSending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.user.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.shabbatBlocked) {
          // חוסמים auto-resend ומציגים הודעה ברורה למשתמש
          setShabbatBlocked(true);
          setError("המערכת לא שולחת הודעות בשבת ובחג. אנא נסה להתחבר במוצאי שבת/חג.");
        } else if (res.status === 429) {
          toast.error("יותר מדי בקשות. אנא נסה שוב בעוד מספר דקות.");
        } else {
          toast.error(data.error || "שגיאה בשליחת קוד אימות");
        }
        return;
      }
      setCodeSent(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      // H4: אם המשתמש בTOTP, ה-server לא שולח כלום — הקוד מגיע מהאפליקציה.
      if (data.method === "TOTP") {
        setIsTotpMode(true);
        // אין צורך בtoast — UI יציג בעצמו את ההוראה לקבל קוד מ-Authenticator.
      } else {
        toast.success("קוד אימות נשלח למייל ול-SMS שלך");
      }
    } catch {
      toast.error("שגיאת רשת. אנא נסה שוב.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.email) return;
    // H18: ב-recovery mode מצפים ל-10 תווים אלפא-נומריים (אפשר עם מקף).
    // נורמליזציה לבדיקת אורך מינימלי בלבד — ה-server עושה את הנרמול הסופי.
    if (isRecoveryMode) {
      const normalized = code.replace(/[\s-]/g, "");
      if (normalized.length !== 10) {
        setError("קוד שחזור: 10 תווים (אפשר עם או בלי מקף)");
        return;
      }
    } else if (code.length !== CODE_LENGTH) {
      setError(`אנא הזן קוד ${CODE_LENGTH} ספרות`);
      return;
    }
    setIsVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.user.email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "קוד שגוי");
        setIsVerifying(false);
        return;
      }
      // הצלחה — לעדכן את ה-session (יוריד את requires2FA ב-jwt callback).
      // הקוד כבר נצרך ב-DB; אם update() נכשל אסור לנווט (ייצור loop):
      // המשתמש יקבל הודעה ויוכל לנסות שוב לעדכן (verifyCode כבר רץ — ה-jwt
      // callback ב-update הבא ימצא את verifiedAt > loginAt וינקה את ה-flag).
      try {
        await update();
      } catch {
        setError(
          "האימות הצליח אך הסשן לא התעדכן. אנא לחץ על 'אמת קוד' שוב או רענן את הדף."
        );
        setIsVerifying(false);
        return;
      }
      if (data.recommendRotation) {
        toast.warning(
          "הקוד שלך נוצל. מומלץ ליצור קודי שחזור חדשים בהגדרות > אבטחה.",
          { duration: 8000 }
        );
      }
      router.push("/dashboard");
    } catch {
      setError("שגיאת רשת. אנא נסה שוב.");
      setIsVerifying(false);
    }
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
            <CardTitle className="text-2xl font-bold">אימות דו-שלבי</CardTitle>
            <CardDescription className="mt-2">
              {isRecoveryMode
                ? "הזן/י את אחד מקודי השחזור ששמרת בעת הפעלת ה-2FA (10 תווים)"
                : isTotpMode
                ? `הזן/י את הקוד בן ${CODE_LENGTH} הספרות מאפליקציית האימות (Authenticator)`
                : `שלחנו קוד אימות בן ${CODE_LENGTH} ספרות למייל ולנייד שלך`}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center animate-fade-in">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="code">{isRecoveryMode ? "קוד שחזור" : "קוד אימות"}</Label>
              <Input
                id="code"
                type="text"
                inputMode={isRecoveryMode ? "text" : "numeric"}
                autoComplete="one-time-code"
                maxLength={isRecoveryMode ? 11 : CODE_LENGTH}
                value={code}
                onChange={(e) => {
                  if (isRecoveryMode) {
                    // recovery: אלפא-נומרי בלבד עם מקף אופציונלי. Uppercase.
                    setCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase().slice(0, 11));
                  } else {
                    setCode(e.target.value.replace(/[^0-9]/g, ""));
                  }
                }}
                disabled={isVerifying}
                autoFocus
                className={
                  isRecoveryMode
                    ? "text-center text-xl tracking-widest font-mono"
                    : "text-center text-2xl tracking-[0.5em] font-mono"
                }
                placeholder={isRecoveryMode ? "XXXXX-XXXXX" : "------"}
                dir="ltr"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={
                isVerifying ||
                (isRecoveryMode
                  ? code.replace(/[\s-]/g, "").length !== 10
                  : code.length !== CODE_LENGTH)
              }
            >
              {isVerifying ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מאמת...
                </>
              ) : (
                "אמת קוד"
              )}
            </Button>

            {/* H18: החלפה בין TOTP לקוד שחזור — רק אם המשתמש ב-TOTP mode */}
            {isTotpMode && (
              <Button
                type="button"
                variant="link"
                className="w-full text-sm"
                onClick={() => {
                  setIsRecoveryMode((v) => !v);
                  setCode("");
                  setError("");
                }}
              >
                {isRecoveryMode
                  ? "חזרה לקוד מאפליקציית Authenticator"
                  : "אין לי גישה לטלפון — השתמש בקוד שחזור"}
              </Button>
            )}

            {/* H4: כפתור "שלח קוד מחדש" לא רלוונטי ל-TOTP — האפליקציה מייצרת
                את הקוד מקומית כל 30 שניות, אין מה לשלוח. */}
            {!isTotpMode && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={sendCode}
                disabled={resendCooldown > 0 || isSending || shabbatBlocked}
              >
                {isSending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    שולח...
                  </>
                ) : shabbatBlocked ? (
                  "לא ניתן לשלוח בשבת/חג"
                ) : resendCooldown > 0 ? (
                  `שלח קוד מחדש בעוד ${resendCooldown} שניות`
                ) : (
                  "שלח קוד מחדש"
                )}
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
        </form>
      </Card>
    </div>
  );
}
