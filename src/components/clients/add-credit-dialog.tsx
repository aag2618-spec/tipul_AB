"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AddCreditDialogProps {
  clientId: string;
  clientName: string;
  currentCredit: number;
  trigger?: React.ReactNode;
}

export function AddCreditDialog({ 
  clientId, 
  clientName, 
  currentCredit,
  trigger 
}: AddCreditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const creditAmount = parseFloat(amount);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      toast.error("נא להזין סכום תקין");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/add-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          amount: creditAmount,
          notes: notes.trim() || undefined
        }),
      });

      if (response.ok) {
        toast.success(`נוסף קרדיט של ₪${creditAmount} ל${clientName}`);
        setOpen(false);
        setAmount("");
        setNotes("");
        router.refresh();
      } else {
        const data = await response.json();
        toast.error(data.message || "שגיאה בהוספת קרדיט");
      }
    } catch (error) {
      console.error("Error adding credit:", error);
      toast.error("שגיאה בהוספת קרדיט");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            הוסף קרדיט
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>הוסף קרדיט ל{clientName}</DialogTitle>
            <DialogDescription>
              קרדיט נוכחי: ₪{currentCredit}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">סכום לקרדיט (₪)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="הזן סכום..."
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={isLoading}
              />
              {amount && !isNaN(parseFloat(amount)) && (
                <p className="text-sm text-muted-foreground">
                  קרדיט חדש: ₪{(currentCredit + parseFloat(amount)).toFixed(2)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">הערות (אופציונלי)</Label>
              <Textarea
                id="notes"
                placeholder="למה ניתן קרדיט זה?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isLoading}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מוסיף...
                </>
              ) : (
                <>
                  <Plus className="ml-2 h-4 w-4" />
                  הוסף קרדיט
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
