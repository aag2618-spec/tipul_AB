"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useShabbat } from "@/hooks/useShabbat";

interface SendReminderButtonProps {
  clientId: string;
  clientName: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function SendReminderButton({
  clientId,
  clientName,
  variant = "outline",
  size = "sm",
  className = "",
}: SendReminderButtonProps) {
  const [sending, setSending] = useState(false);
  const { isShabbat, tooltip } = useShabbat();

  const handleSend = async () => {
    try {
      setSending(true);
      const res = await fetch(`/api/clients/${clientId}/send-debt-reminder`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || data.error || "שגיאה בשליחת התזכורת");
      }

      // גם ב-200 שרת עלול להחזיר success: false (למשל בשבת)
      if (data.success === false) {
        toast.error(data.message || "התזכורת לא נשלחה");
        return;
      }

      toast.success(`תזכורת נשלחה בהצלחה ל-${clientName}!`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "שגיאה בשליחת התזכורת");
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSend}
      disabled={sending || isShabbat}
      title={isShabbat ? tooltip ?? undefined : undefined}
      className={`gap-2 bg-sky-600 hover:bg-sky-700 text-white shadow-md ${className}`}
    >
      {sending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          שולח...
        </>
      ) : (
        <>
          <Mail className="h-4 w-4" />
          שלח תזכורת
        </>
      )}
    </Button>
  );
}
