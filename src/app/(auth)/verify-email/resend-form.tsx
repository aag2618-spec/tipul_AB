"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

export function ResendVerificationForm() {
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
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.shabbatBlocked) {
          // בשבת לא נשלח כלום — להציג הודעה ולא לעבור למסך הצלחה
          toast(data.message || "המערכת לא שולחת הודעות בשבת ובחג.");
        } else {
          setIsSent(true);
          toast.success(data.message || "אם החשבון קיים, נשלח קישור אימות חדש");
        }
      } else if (response.status === 429) {
        toast.error("יותר מדי בקשות. נסה שוב בעוד כמה דקות.");
      } else {
        toast.error(data.message || "שגיאה בשליחת הקישור");
      }
    } catch {
      toast.error("שגיאה בשליחת הקישור");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
      <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-4 text-sm text-sky-700 dark:text-sky-300 flex items-start gap-2 text-right">
        <Mail className="h-4 w-4 shrink-0 mt-0.5" />
        <span>אם החשבון קיים, נשלח אליו קישור אימות חדש. בדוק את תיבת הדואר (כולל ספאם).</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-right">
      <div className="space-y-2">
        <Label htmlFor="resend-email">כתובת אימייל</Label>
        <Input
          id="resend-email"
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
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            שולח...
          </>
        ) : (
          "שלח קישור אימות חדש"
        )}
      </Button>
    </form>
  );
}
