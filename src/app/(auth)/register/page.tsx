"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Leaf, Star, CheckCircle, ChevronDown, ChevronUp, Mail } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    license: "",
    couponCode: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }

    if (formData.password.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          license: formData.license,
          couponCode: formData.couponCode || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "אירעה שגיאה בהרשמה");
      }

      // Show success with email verification message
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה בהרשמה");
    } finally {
      setIsLoading(false);
    }
  };

  // Success state - show email verification message
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
        
        <Card className="w-full max-w-md animate-fade-in relative text-center">
          <CardHeader className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">בדוק את המייל שלך!</CardTitle>
              <CardDescription className="mt-3 text-base leading-relaxed">
                שלחנו קישור אימות ל-<strong className="text-foreground">{formData.email}</strong>
              </CardDescription>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
              <p className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span>לחץ על הקישור במייל כדי לאמת את החשבון</span>
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span>לאחר האימות, תוכל להתחבר ולהתחיל את תקופת הניסיון</span>
              </p>
              <p className="flex items-center gap-2">
                <Star className="h-4 w-4 text-purple-600 shrink-0" />
                <span>14 ימי ניסיון חינם במסלול Pro</span>
              </p>
            </div>
            
            <p className="text-xs text-muted-foreground">
              לא קיבלת מייל? בדוק בתיקיית הספאם.
            </p>
          </CardContent>
          
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
              עבור לדף ההתחברות
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      
      <Card className="w-full max-w-md animate-fade-in relative">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Leaf className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">הרשמה למערכת</CardTitle>
            <CardDescription className="mt-2">
              התחל את תקופת הניסיון שלך - 14 ימים חינם במסלול Pro
            </CardDescription>
          </div>
          {/* Trial badge */}
          <div className="inline-flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full px-3 py-1 text-xs font-medium mx-auto">
            <Star className="h-3 w-3" />
            ללא התחייבות, ללא פרטי אשראי
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
              <Label htmlFor="name">שם מלא</Label>
              <Input
                id="name"
                name="name"
                placeholder="ד״ר ישראל ישראלי"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLoading}
                className="text-left"
                dir="ltr"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">טלפון (אופציונלי)</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="050-1234567"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="text-left"
                  dir="ltr"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="license">מספר רישיון (אופציונלי)</Label>
                <Input
                  id="license"
                  name="license"
                  placeholder="123456"
                  value={formData.license}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="לפחות 8 תווים"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isLoading}
                className="text-left"
                dir="ltr"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">אימות סיסמה</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="הזן שוב את הסיסמה"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isLoading}
                className="text-left"
                dir="ltr"
              />
            </div>

            {/* Coupon code - optional, collapsible */}
            <div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                onClick={() => setShowCoupon(!showCoupon)}
              >
                {showCoupon ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                יש לך קוד קופון?
              </button>
              {showCoupon && (
                <div className="mt-2">
                  <Input
                    id="couponCode"
                    name="couponCode"
                    placeholder="הזן קוד קופון (אופציונלי)"
                    value={formData.couponCode}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="text-left"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  יוצר חשבון...
                </>
              ) : (
                "הרשמה - התחל ניסיון חינם"
              )}
            </Button>
            
            <p className="text-sm text-muted-foreground text-center">
              יש לך כבר חשבון?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                התחברות
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
