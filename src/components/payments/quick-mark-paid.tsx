"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface QuickMarkPaidProps {
  sessionId: string;
  clientId: string;
  amount: number;
  existingPayment?: {
    id: string;
    status: string;
    method?: string;
  } | null;
}

export function QuickMarkPaid({
  sessionId,
  clientId,
  amount,
  existingPayment,
}: QuickMarkPaidProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<string>("CASH");
  const router = useRouter();

  // If already paid, show badge
  if (existingPayment?.status === "PAID") {
    return (
      <Badge variant="default" className="gap-1">
        <Check className="h-3 w-3" />
        שולם
      </Badge>
    );
  }

  const handleMarkPaid = async () => {
    setIsLoading(true);
    try {
      if (existingPayment) {
        // Update existing payment
        const response = await fetch(`/api/payments/${existingPayment.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "PAID",
            method,
            paidAt: new Date().toISOString(),
          }),
        });

        if (!response.ok) throw new Error("Failed to update payment");
      } else {
        // Create new payment and mark as paid
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            sessionId,
            amount,
            method,
            status: "PAID",
          }),
        });

        if (!response.ok) throw new Error("Failed to create payment");
      }

      toast.success("התשלום סומן כשולם");
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("שגיאה בעדכון התשלום");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <CreditCard className="h-3 w-3" />
          {existingPayment?.status === "PENDING" ? "סמן שולם" : "הוסף תשלום"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>סימון תשלום</DialogTitle>
          <DialogDescription>
            סכום: ₪{amount}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="method">אמצעי תשלום</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue placeholder="בחר אמצעי תשלום" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">מזומן</SelectItem>
                <SelectItem value="CREDIT_CARD">כרטיס אשראי</SelectItem>
                <SelectItem value="BANK_TRANSFER">העברה בנקאית</SelectItem>
                <SelectItem value="CHECK">צ׳ק</SelectItem>
                <SelectItem value="OTHER">אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
          >
            ביטול
          </Button>
          <Button onClick={handleMarkPaid} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מעדכן...
              </>
            ) : (
              <>
                <Check className="ml-2 h-4 w-4" />
                סמן כשולם
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
