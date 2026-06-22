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
      // 200 אך לא נשלח (sent === 0): בעל/ת קליניקה או מזכיר/ה ששולח/ת בשם מטפל
      // אחר שהזימון העצמי שלו כבוי → השרת מדלג (skip) ומחזיר 200. אסור להציג
      // "נשלח" כוזב. (כשהמטופל/ת שייך/ת לקורא/ת והזימון כבוי השרת מחזיר 400.)
      if ((data.sent ?? 0) === 0) {
        if ((data.skipped ?? 0) > 0) {
          toast.error("הקישור לא נשלח — הזימון העצמי כבוי אצל המטפל/ת של המטופל/ת");
        } else {
          toast.error(data.errors?.[0] || data.message || "שגיאה בשליחת הקישור");
        }
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
