"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Leaf, CheckCircle, AlertTriangle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";
  const registered = searchParams.get("registered") === "true";
  const tokenError = searchParams.get("error");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      
      <Card className="w-full max-w-md animate-fade-in relative">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Leaf className="w-8 h-8 text-primary" />
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
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm text-center animate-fade-in">
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
    </div>
  );
}













