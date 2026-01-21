"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Leaf } from "lucide-react";

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
          couponCode: formData.couponCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "אירעה שגיאה בהרשמה");
      }

      router.push("/login?registered=true");
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה בהרשמה");
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
            <CardTitle className="text-2xl font-bold">הרשמה למערכת</CardTitle>
            <CardDescription className="mt-2">
              צרו חשבון חדש לניהול הפרקטיקה שלכם
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
                <Label htmlFor="phone">טלפון</Label>
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
                <Label htmlFor="license">מספר רישיון</Label>
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
              <Label htmlFor="couponCode">קוד קופון</Label>
              <Input
                id="couponCode"
                name="couponCode"
                placeholder="הזן קוד קופון להרשמה"
                value={formData.couponCode}
                onChange={handleChange}
                required
                disabled={isLoading}
                className="text-left"
                dir="ltr"
              />
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
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  יוצר חשבון...
                </>
              ) : (
                "הרשמה"
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













