"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { ArrowRight, Lock, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setError("חסר קישור לאיפוס");
      return;
    }

    // Validate token
    fetch(`/api/auth/reset-password?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        setIsValid(data.valid);
        if (!data.valid) {
          setError(data.error || "קישור לא תקין");
        }
      })
      .catch(() => {
        setError("שגיאה בבדיקת הקישור");
      })
      .finally(() => {
        setIsValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    if (password.length < 6) {
      toast.error("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("הסיסמאות לא תואמות");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsSuccess(true);
        toast.success("הסיסמה עודכנה בהצלחה!");
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      } else {
        toast.error(data.error || "שגיאה באיפוס הסיסמה");
      }
    } catch {
      toast.error("שגיאה באיפוס הסיסמה");
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin mb-4" />
            <p className="text-slate-400">בודק את הקישור...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <CardTitle className="text-2xl text-white">קישור לא תקין</CardTitle>
            <CardDescription className="text-slate-400 text-base">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full bg-amber-500 hover:bg-amber-600 text-black">
              <Link href="/forgot-password">
                בקש קישור חדש
              </Link>
            </Button>
            <div className="text-center">
              <Link
                href="/login"
                className="text-slate-400 hover:text-slate-300 text-sm inline-flex items-center"
              >
                <ArrowRight className="h-4 w-4 ml-1" />
                חזרה לכניסה
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl text-white">הסיסמה עודכנה!</CardTitle>
            <CardDescription className="text-slate-400 text-base">
              הסיסמה שלך עודכנה בהצלחה. מעביר אותך לדף הכניסה...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-amber-500 hover:bg-amber-600 text-black">
              <Link href="/login">
                <ArrowRight className="h-4 w-4 ml-2" />
                כניסה למערכת
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl text-white">איפוס סיסמה</CardTitle>
          <CardDescription className="text-slate-400">
            הזן סיסמה חדשה למשתמש שלך
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">
                סיסמה חדשה
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="לפחות 6 תווים"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">
                אימות סיסמה
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="הזן שוב את הסיסמה"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                dir="ltr"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  מעדכן...
                </>
              ) : (
                "עדכן סיסמה"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
          <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
