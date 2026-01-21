"use client";

import { useState } from "react";
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
import { ArrowRight, Mail, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error("נא להזין כתובת אימייל");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsSent(true);
        toast.success("נשלח אימייל עם קישור לאיפוס");
      } else {
        toast.error(data.error || "שגיאה בשליחת האימייל");
      }
    } catch {
      toast.error("שגיאה בשליחת האימייל");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl text-white">נשלח בהצלחה!</CardTitle>
            <CardDescription className="text-slate-400 text-base">
              אם האימייל {email} רשום במערכת, נשלח אליו קישור לאיפוס סיסמה.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-400 text-sm text-center">
              בדוק את תיבת הדואר שלך (כולל ספאם). הקישור תקף לשעה אחת.
            </p>
            <div className="flex flex-col gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsSent(false)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                לנסות שוב עם אימייל אחר
              </Button>
              <Button asChild className="bg-amber-500 hover:bg-amber-600 text-black">
                <Link href="/login">
                  <ArrowRight className="h-4 w-4 ml-2" />
                  חזרה לכניסה
                </Link>
              </Button>
            </div>
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
            <Mail className="h-8 w-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl text-white">שכחת סיסמה?</CardTitle>
          <CardDescription className="text-slate-400">
            הזן את האימייל שלך ונשלח לך קישור לאיפוס הסיסמה
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">
                כתובת אימייל
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  שולח...
                </>
              ) : (
                "שלח קישור לאיפוס"
              )}
            </Button>
            <div className="text-center">
              <Link
                href="/login"
                className="text-amber-500 hover:text-amber-400 text-sm inline-flex items-center"
              >
                <ArrowRight className="h-4 w-4 ml-1" />
                חזרה לכניסה
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
