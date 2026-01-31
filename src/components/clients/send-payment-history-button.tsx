"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mail, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface SendPaymentHistoryButtonProps {
  clientId: string;
  clientEmail?: string | null;
  hasPayments: boolean;
}

export function SendPaymentHistoryButton({
  clientId,
  clientEmail,
  hasPayments,
}: SendPaymentHistoryButtonProps) {
  const [sending, setSending] = useState(false);

  const handleSend = async (period: string) => {
    if (!clientEmail) {
      toast.error("למטופל אין כתובת מייל");
      return;
    }

    if (!hasPayments) {
      toast.error("אין תשלומים לשלוח");
      return;
    }

    try {
      setSending(true);

      const response = await fetch(
        `/api/clients/${clientId}/send-payment-history`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send");
      }

      toast.success(
        `סיכום תשלומים נשלח בהצלחה! (${data.paymentsCount} תשלומים, סה"כ ₪${data.totalPaid})`
      );
    } catch (error: any) {
      console.error("Error sending payment history:", error);
      toast.error(error.message || "שגיאה בשליחת סיכום תשלומים");
    } finally {
      setSending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={!clientEmail || !hasPayments || sending}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              שולח...
            </>
          ) : (
            <>
              <Mail className="h-4 w-4 ml-2" />
              שלח סיכום למייל
              <ChevronDown className="h-4 w-4 mr-2" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleSend("month")}>
          חודש אחרון
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSend("3months")}>
          3 חודשים אחרונים
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSend("year")}>
          שנה אחרונה
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSend("all")}>
          כל ההיסטוריה
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
