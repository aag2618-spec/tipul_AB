"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Payment {
  id: string;
  amount: string;
  method: string;
  status: string;
  notes: string | null;
  createdAt: string;
  client: { id: string; name: string };
}

export default function MarkPaidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [method, setMethod] = useState("CASH");

  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const response = await fetch(`/api/payments/${id}`);
        if (response.ok) {
          const data = await response.json();
          setPayment(data);
          setMethod(data.method);
        }
      } catch (error) {
        console.error("Failed to fetch payment:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayment();
  }, [id]);

  const handleMarkPaid = async () => {
    setIsSaving(true);

    try {
      const response = await fetch(`/api/payments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PAID",
          method,
          paidAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בעדכון");
      }

      toast.success("התשלום סומן כשולם");
      router.push("/dashboard/payments");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("אירעה שגיאה בעדכון");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <p className="text-muted-foreground">תשלום לא נמצא</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/payments">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">סמן כשולם</h1>
          <p className="text-muted-foreground">אשר קבלת תשלום</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי התשלום</CardTitle>
          <CardDescription>אשר את פרטי התשלום</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">מטופל:</span>
              <span className="font-medium">{payment.client.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">סכום:</span>
              <span className="font-bold text-lg">₪{Number(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">תאריך יצירה:</span>
              <span>{format(new Date(payment.createdAt), "dd/MM/yyyy")}</span>
            </div>
            {payment.notes && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">הערות:</span>
                <span>{payment.notes}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>אמצעי תשלום</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
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

          <div className="flex gap-3 pt-4">
            <Button onClick={handleMarkPaid} disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מעדכן...
                </>
              ) : (
                <>
                  <CheckCircle className="ml-2 h-4 w-4" />
                  סמן כשולם
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              ביטול
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}







