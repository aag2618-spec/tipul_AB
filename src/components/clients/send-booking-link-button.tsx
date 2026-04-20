"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useShabbat } from "@/hooks/useShabbat";

interface SendBookingLinkButtonProps {
  clientId: string;
  clientName: string;
}

export function SendBookingLinkButton({ clientId, clientName }: SendBookingLinkButtonProps) {
  const [sending, setSending] = useState(false);
  const { isShabbat, tooltip } = useShabbat();

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch("/api/user/booking-settings/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: [clientId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || data.error || "שגיאה בשליחה");
        return;
      }
      // גם ב-200 שרת עלול להחזיר success: false (למשל בשבת)
      if (data.success === false) {
        toast.error(data.message || "הקישור לא נשלח");
        return;
      }
      toast.success(`קישור זימון נשלח ל-${clientName}`);
    } catch {
      toast.error("שגיאה בשליחה");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleSend}
      disabled={sending || isShabbat}
      title={isShabbat ? tooltip ?? undefined : undefined}
    >
      {sending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}
      {sending ? "שולח..." : "שלח קישור זימון"}
    </Button>
  );
}
