"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  CreditCard,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  price: number;
  type: string;
  status: string;
  payment?: {
    id: string;
    amount: number;
    expectedAmount: number;
    status: string;
    method: string;
  } | null;
}

interface ClientData {
  id: string;
  name: string;
  creditBalance: number;
  sessions: Session[];
}

export default function ClientPaymentsPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientData | null>(null);
  const [bulkAmount, setBulkAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [processing, setProcessing] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/clients/${clientId}/unpaid-sessions`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setClient(data);
    } catch (error) {
      toast.error("שגיאה בטעינת נתוני המטופל");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPayment = async () => {
    if (!bulkAmount || Number(bulkAmount) <= 0) {
      toast.error("נא להזין סכום תקין");
      return;
    }

    try {
      setProcessing(true);
      const res = await fetch(`/api/clients/${clientId}/bulk-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(bulkAmount),
          method: paymentMethod,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "שגיאה בעיבוד התשלום");
      }

      const result = await res.json();
      toast.success(`התשלום עובד בהצלחה! קוזזו ${result.sessionsUpdated} פגישות`);
      setBulkAmount("");
      await fetchClientData();
    } catch (error: any) {
      toast.error(error.message || "שגיאה בעיבוד התשלום");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const calculateSessionDebt = (session: Session) => {
    if (!session.payment) return session.price;
    return Number(session.payment.expectedAmount) - Number(session.payment.amount);
  };

  const calculateTotalDebt = () => {
    if (!client) return 0;
    return client.sessions.reduce((sum, session) => {
      return sum + calculateSessionDebt(session);
    }, 0);
  };

  const handleSendReminder = async () => {
    try {
      setSendingReminder(true);
      const res = await fetch(`/api/clients/${clientId}/send-debt-reminder`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "שגיאה בשליחת התזכורת");
      }

      toast.success("תזכורת נשלחה בהצלחה למייל המטופל!");
    } catch (error: any) {
      toast.error(error.message || "שגיאה בשליחת התזכורת");
      console.error(error);
    } finally {
      setSendingReminder(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg text-muted-foreground">לא נמצאו נתונים</p>
      </div>
    );
  }

  const totalDebt = calculateTotalDebt();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/dashboard/clients/${clientId}`}>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">תשלומים - {client.name}</h1>
            <p className="text-muted-foreground">
              {client.sessions.length} פגישות ממתינות לתשלום
            </p>
          </div>
        </div>
        
        {/* Send Reminder Button */}
        {client.sessions.length > 0 && (
          <Button
            onClick={handleSendReminder}
            disabled={sendingReminder}
            className="gap-2 bg-sky-600 hover:bg-sky-700 text-white shadow-lg"
            size="lg"
          >
            {sendingReminder ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                שולח תזכורת...
              </>
            ) : (
              <>
                <Mail className="h-5 w-5" />
                שלח תזכורת חוב למטופל
              </>
            )}
          </Button>
        )}
      </div>

      {/* Summary Card */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">חוב כולל</p>
                <p className="text-3xl font-bold text-red-600">₪{totalDebt}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">קרדיט זמין</p>
                <p className="text-3xl font-bold text-green-600">
                  ₪{client.creditBalance}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Payment Section */}
      <Card className="border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            תשלום כללי
          </CardTitle>
          <CardDescription>
            הזן סכום שהמטופל שילם - המערכת תקזז אוטומטית לפי סדר הפגישות.
            <br />
            <span className="text-green-600 font-medium">💡 תשלום עודף יתווסף אוטומטית ליתרת הקרדיט של הלקוח</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bulk-amount">סכום לתשלום</Label>
              <Input
                id="bulk-amount"
                type="number"
                placeholder="0"
                value={bulkAmount}
                onChange={(e) => setBulkAmount(e.target.value)}
                disabled={processing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-method">אמצעי תשלום</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={processing}>
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">מזומן</SelectItem>
                  <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                  <SelectItem value="BANK_TRANSFER">העברה בנקאית</SelectItem>
                  <SelectItem value="CHECK">צ׳ק</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleBulkPayment}
                disabled={processing || !bulkAmount}
                className="w-full"
                size="lg"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    מעבד...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 ml-2" />
                    קזז ושלם
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>פגישות לתשלום</CardTitle>
          <CardDescription>פגישות שטרם שולמו או שולמו חלקית</CardDescription>
        </CardHeader>
        <CardContent>
          {client.sessions.length > 0 ? (
            <div className="space-y-3">
              {client.sessions.map((session) => {
                const debt = calculateSessionDebt(session);
                const paid = session.payment ? Number(session.payment.amount) : 0;
                const percentage = session.payment
                  ? (paid / Number(session.payment.expectedAmount)) * 100
                  : 0;

                return (
                  <div
                    key={session.id}
                    className="flex flex-col gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    {/* Session Info */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {format(new Date(session.startTime), "EEEE, d בMMMM", {
                              locale: he,
                            })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(session.startTime), "HH:mm")} •{" "}
                            {session.type === "ONLINE"
                              ? "אונליין"
                              : session.type === "PHONE"
                              ? "טלפון"
                              : "פרונטלי"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Status and Button */}
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-3">
                        {paid > 0 && debt > 0 ? (
                          <>
                            <Badge variant="secondary" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              שולם חלקית ({percentage.toFixed(0)}%)
                            </Badge>
                            <div className="text-sm">
                              <span className="text-green-600 font-medium">שולם: ₪{paid}</span>
                              <span className="text-muted-foreground mx-1">/</span>
                              <span className="text-red-600 font-medium">נותר: ₪{debt}</span>
                            </div>
                          </>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            לא שולם - ₪{debt}
                          </Badge>
                        )}
                      </div>

                      {/* Payment Button */}
                      <Button variant="default" size="sm" asChild className="gap-2">
                        <Link href={`/dashboard/payments/pay/${clientId}?session=${session.id}`}>
                          <CreditCard className="h-4 w-4" />
                          {paid > 0 ? "השלם תשלום" : "שלם"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="mx-auto h-16 w-16 mb-4 opacity-50 text-green-600" />
              <p className="text-lg font-medium">כל הפגישות שולמו! 🎉</p>
              <p className="text-sm mt-2">אין פגישות ממתינות לתשלום</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
