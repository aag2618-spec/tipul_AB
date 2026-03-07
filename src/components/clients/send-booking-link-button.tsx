"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SendBookingLinkButtonProps {
  clientId: string;
  clientName: string;
}

export function SendBookingLinkButton({ clientId, clientName }: SendBookingLinkButtonProps) {
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch("/api/user/booking-settings/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: [clientId] }),
      });
      const data = await res.json();
      if (res.ok) toast.success(`קישור זימון נשלח ל-${clientName}`);
      else toast.error(data.error || "שגיאה בשליחה");
    } catch {
      toast.error("שגיאה בשליחה");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleSend} disabled={sending}>
      {sending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}
      {sending ? "שולח..." : "שלח קישור זימון"}
    </Button>
  );
}
