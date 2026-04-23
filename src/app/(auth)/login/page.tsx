"use client";

import { useEffect, useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLogo } from "@/components/app-logo";
import { Loader2, CheckCircle, AlertTriangle, Mail } from "lucide-react";
import { toast } from "sonner";

const RESEND_COOLDOWN_SECONDS = 60;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";
  const registered = searchParams.get("registered") === "true";
  const tokenError = searchParams.get("error");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const needsVerification = error.includes("לאמת את כתובת המייל");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    if (!email) {
      toast.error("נא להזין את כתובת האימייל למעלה");
      return;
    }
    setIsResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok) {
        if (data.shabbatBlocked) {
          // בשבת לא נשלח כלום — לא להדליק cooldown כי הסיבה לא הסתיימה
          toast(data.message || "המערכת לא שולחת הודעות בשבת ובחג.");
        } else {
          toast.success(data.message || "אם החשבון קיים, נשלח קישור אימות חדש");
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
        }
      } else if (response.status === 429) {
        toast.error("יותר מדי בקשות. נסה שוב בעוד כמה דקות.");
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        toast.error(data.message || "שגיאה בשליחת הקישור");
      }
    } catch {
      toast.error("שגיאה בשליחת הקישור");
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("אירעה שגיאה בהתחברות");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md animate-fade-in relative">
      <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex justify-center">
            <AppLogo width={344} height={192} className="h-14 w-auto object-contain" priority />
          </div>
        <div>
          <CardTitle className="text-2xl font-bold">ברוכים הבאים</CardTitle>
          <CardDescription className="mt-2">
            התחברו למערכת ניהול הפרקטיקה שלכם
          </CardDescription>
        </div>
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {/* Email verification success */}
          {verified && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm text-center animate-fade-in flex items-center justify-center gap-2">
              <CheckCircle className="h-4 w-4" />
              המייל אומת בהצלחה! התחבר כדי להתחיל
            </div>
          )}

          {/* Registered but needs verification */}
          {registered && !verified && (
            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 text-sm text-center animate-fade-in">
              ההרשמה הצליחה! בדוק את המייל שלך לאימות החשבון
            </div>
          )}

          {/* Token errors */}
          {tokenError === "invalid-token" && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm text-center animate-fade-in flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              הקישור לא תקין או פג תוקף. נסה להירשם מחדש.
            </div>
          )}

          {tokenError === "missing-token" && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm text-center animate-fade-in flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              קישור אימות חסר. נסה שוב.
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center animate-fade-in">
              {error}
            </div>
          )}

          {needsVerification && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleResend}
              disabled={isResending || resendCooldown > 0}
            >
              {isResending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  שולח...
                </>
              ) : resendCooldown > 0 ? (
                `אפשר לשלוח שוב בעוד ${resendCooldown} שניות`
              ) : (
                <>
                  <Mail className="ml-2 h-4 w-4" />
                  שלח שוב את מייל האימות
                </>
              )}
            </Button>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="text-left"
              dir="ltr"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="password">סיסמה</Label>
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                שכחת סיסמה?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="text-left"
              dir="ltr"
            />
          </div>
        </CardContent>
        
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מתחבר...
              </>
            ) : (
              "התחברות"
            )}
          </Button>
          
          <p className="text-sm text-muted-foreground text-center">
            אין לך חשבון?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              הרשמה
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      <Suspense fallback={
        <Card className="w-full max-w-md relative">
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
