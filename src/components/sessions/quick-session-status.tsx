"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, CheckCircle, XCircle, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface QuickSessionStatusProps {
  sessionId: string;
  clientId: string;
  currentStatus: string;
}

export function QuickSessionStatus({
  sessionId,
  clientId,
  currentStatus,
}: QuickSessionStatusProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const updateSessionStatus = async (status: string) => {
    try {
      setIsLoading(true);

      if (status === "COMPLETED") {
        // Use PUT to create payment + mark as completed
        const response = await fetch(`/api/sessions/${sessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED", createPayment: true, markAsPaid: false }),
        });
        if (response.ok) {
          toast.success("הפגישה הושלמה, מעבר לדף תשלום...");
          router.push(`/dashboard/payments/pay/${clientId}`);
        } else {
          const errorData = await response.json().catch(() => null);
          toast.error(errorData?.message || "שגיאה בעדכון הסטטוס");
        }
        return;
      }

      // For non-COMPLETED statuses, use PATCH as before
      const response = await fetch(`/api/sessions/${sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        toast.success(
          status === "NO_SHOW"
            ? "סומן כ'אי הופעה'"
            : "הפגישה בוטלה"
        );
        router.refresh();
      } else {
        const errorData = await response.json().catch(() => null);
        toast.error(errorData?.message || "שגיאה בעדכון הסטטוס");
      }
    } catch (error) {
      console.error("Error updating session status:", error);
      toast.error("שגיאה בעדכון הסטטוס");
    } finally {
      setIsLoading(false);
    }
  };

  if (currentStatus !== "SCHEDULED") {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="default"
        className="h-7 text-xs bg-green-600 hover:bg-green-700"
        onClick={() => updateSessionStatus("COMPLETED")}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <CheckCircle className="h-3 w-3 ml-1" />
            הגיע
          </>
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={isLoading}
          >
            <XCircle className="h-3 w-3 ml-1" />
            אי הופעה
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => updateSessionStatus("NO_SHOW")}>
            <XCircle className="h-4 w-4 ml-2" />
            אי הופעה לפגישה
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => updateSessionStatus("CANCELLED")}>
            <PauseCircle className="h-4 w-4 ml-2" />
            ביטל את הפגישה
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
