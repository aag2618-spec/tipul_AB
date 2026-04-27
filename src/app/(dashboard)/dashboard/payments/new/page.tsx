"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { ChargeCardcomDialog } from "@/components/payments/charge-cardcom-dialog";

interface Client {
  id: string;
  name: string;
}

function NewPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    clientId: searchParams.get("client") || "",
    amount: "",
    method: "CASH",
    notes: "",
    status: "PENDING", // Default to pending (debt)
  });
  // ── Cardcom flow state ────────────────────────────────────
  const [cardcomOpen, setCardcomOpen] = useState(false);
  const [cardcomPaymentId, setCardcomPaymentId] = useState<string | undefined>(undefined);
  const [cardcomAmount, setCardcomAmount] = useState<number>(0);
  const [cardcomClientName, setCardcomClientName] = useState<string>("");

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch("/api/clients");
        if (response.ok) {
          const data = await response.json();
          setClients(data);
        }
      } catch (error) {
        console.error("Failed to fetch clients:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.clientId || !formData.amount) {
      toast.error("נא למלא את כל השדות הנדרשים");
      return;
    }

    const amt = parseFloat(formData.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("סכום לא תקין");
      return;
    }

    // ── Cardcom intercept ────────────────────────────────────
    // אם המשתמש בחר "שולם" + "כרטיס אשראי" — חייבים סליקה אמיתית.
    // יוצרים תחילה Payment ב-PENDING ופותחים ChargeCardcomDialog. ה-webhook
    // יעדכן ל-PAID. אם המשתמש בחר "חוב" + אשראי, לא נריץ Cardcom — זו רק
    // רישום של חוב עתידי שיתבצע ידנית.
    if (formData.status === "PAID" && formData.method === "CREDIT_CARD") {
      setIsSaving(true);
      try {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: formData.clientId,
            amount: amt,
            expectedAmount: amt,
            paymentType: "FULL",
            method: "CREDIT_CARD",
            notes: formData.notes,
            status: "PENDING",
            // הקבלה תופק ע״י Cardcom Documents API ב-webhook.
            issueReceipt: false,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message || "שגיאה ביצירת התשלום");
        }
        const created = (await res.json()) as { id: string };
        const clientName =
          clients.find((c) => c.id === formData.clientId)?.name || "מטופל";
        setCardcomPaymentId(created.id);
        setCardcomAmount(amt);
        setCardcomClientName(clientName);
        setCardcomOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "שגיאה ביצירת התשלום");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: formData.clientId,
          amount: formData.status === "PAID" ? amt : 0,
          expectedAmount: amt,
          paymentType: "FULL",
          method: formData.method,
          notes: formData.notes,
          status: formData.status,
          paidAt: formData.status === "PAID" ? new Date().toISOString() : null,
          issueReceipt: formData.status === "PAID",
        }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בשמירה");
      }

      toast.success(formData.status === "PAID" ? "התשלום נרשם בהצלחה" : "החוב נרשם בהצלחה");
      router.push("/dashboard/payments");
    } catch (error) {
      console.error("Save error:", error);
      toast.error("אירעה שגיאה בשמירה");
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

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תשלום חדש</h1>
          <p className="text-muted-foreground">הוסף תשלום או חוב למטופל</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>פרטי התשלום</CardTitle>
            <CardDescription>מלא את הפרטים הנדרשים</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">מטופל *</Label>
                <Select
                  value={formData.clientId}
                  onValueChange={(v) => setFormData({ ...formData, clientId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר מטופל" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">סכום (₪) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">סטטוס</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">חוב (ממתין לתשלום)</SelectItem>
                    <SelectItem value="PAID">שולם</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="method">אמצעי תשלום</Label>
                <Select
                  value={formData.method}
                  onValueChange={(v) => setFormData({ ...formData, method: v })}
                >
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">הערות</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="הערות נוספות..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={isSaving} className="flex-1">
                {isSaving ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    שומר...
                  </>
                ) : formData.status === "PAID" && formData.method === "CREDIT_CARD" ? (
                  <>
                    <CreditCard className="ml-2 h-4 w-4" />
                    המשך לסליקה ב-Cardcom
                  </>
                ) : (
                  <>
                    <CreditCard className="ml-2 h-4 w-4" />
                    {formData.status === "PAID" ? "שמור תשלום" : "שמור חוב"}
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/payments">ביטול</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <ChargeCardcomDialog
        open={cardcomOpen}
        onOpenChange={setCardcomOpen}
        paymentId={cardcomPaymentId}
        clientId={formData.clientId}
        clientName={cardcomClientName}
        amount={cardcomAmount}
        defaultDescription="תשלום"
        onPaymentSuccess={async () => {
          toast.success("התשלום בוצע בהצלחה");
          router.push("/dashboard/payments");
        }}
      />
    </div>
  );
}

export default function NewPaymentPage() {
  return (
    <Suspense fallback={
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <NewPaymentContent />
    </Suspense>
  );
}







