"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  className,
}: SendReminderButtonProps) {
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    try {
      setSending(true);
      const res = await fetch(`/api/clients/${clientId}/send-debt-reminder`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "שגיאה בשליחת התזכורת");
      }
      
      toast.success(`תזכורת נשלחה בהצלחה ל-${clientName}!`);
    } catch (error: any) {
      toast.error(error.message || "שגיאה בשליחת התזכורת");
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSend}
      disabled={sending}
      className={className}
    >
      {sending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin ml-2" />
          שולח...
        </>
      ) : (
        <>
          <Mail className="h-4 w-4 ml-2" />
          שלח תזכורת
        </>
      )}
    </Button>
  );
}
