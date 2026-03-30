"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight, Loader2, CreditCard, Calendar, User, Hash, Banknote, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { calculateDebtFromPayments, calculateSessionDebt } from "@/lib/payment-utils";
import { he } from "date-fns/locale";
import { PayClientDebts } from "@/components/payments/pay-client-debts";
import { AddCreditDialog } from "@/components/clients/add-credit-dialog";

interface UnpaidSession {
  paymentId: string;
  sessionId: string | null;
  date: Date;
  amount: number;
  expectedAmount: number;
  status: string;
}

interface ClientData {
  id: string;
  name: string;
  email: string | null;
  creditBalance: number;
  unpaidSessions: UnpaidSession[];
  totalDebt: number;
}

type SelectionMode = "sessions" | "amount" | "manual";

export default function PayClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<ClientData | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("manual");
  const [numSessions, setNumSessions] = useState<string>("1");
  const [targetAmount, setTargetAmount] = useState<string>("");

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/payments/client-debt/${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data);
        // Start with empty selection in manual mode
        setSelectedPayments(new Set());
      } else {
        toast.error("שגיאה בטעינת נתונים");
        router.push("/dashboard/payments");
      }
    } catch (error) {
      console.error("Error fetching client data:", error);
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePayment = (paymentId: string) => {
    const newSelected = new Set(selectedPayments);
    if (newSelected.has(paymentId)) {
      newSelected.delete(paymentId);
    } else {
      newSelected.add(paymentId);
    }
    setSelectedPayments(newSelected);
  };

  const toggleAll = () => {
    if (selectedPayments.size === client?.unpaidSessions.length) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(client?.unpaidSessions.map(s => s.paymentId)));
    }
  };

  const handleSelectionModeChange = (mode: SelectionMode) => {
    setSelectionMode(mode);
    if (!client) return;

    switch (mode) {
      case "sessions":
        // Select first N sessions
        selectFirstNSessions(parseInt(numSessions) || 1);
        break;
      case "amount":
        // Select sessions up to target amount
        selectByAmount(parseFloat(targetAmount) || 0);
        break;
      case "manual":
        // Clear selection for manual selection
        setSelectedPayments(new Set());
        break;
    }
  };

  const selectFirstNSessions = useCallback((n: number) => {
    if (!client) return;
    const firstN = client.unpaidSessions.slice(0, n);
    setSelectedPayments(new Set(firstN.map(s => s.paymentId)));
  }, [client]);

  const selectByAmount = useCallback((amount: number) => {
    if (!client) return;
    let accumulated = 0;
    const selected = new Set<string>();

    for (const session of client.unpaidSessions) {
      const debt = session.expectedAmount - session.amount;
      
      if (accumulated + debt <= amount) {
        // יש מספיק כסף לשלם את הפגישה במלואה
        selected.add(session.paymentId);
        accumulated += debt;
      } else if (accumulated < amount) {
        // לא מספיק לפגישה מלאה, אבל יש עוד כסף - תשלום חלקי
        selected.add(session.paymentId);
        accumulated = amount; // השתמש בכל הכסף שנשאר
        break;
      } else {
        break;
      }
    }

    setSelectedPayments(selected);
  }, [client]);

  useEffect(() => {
    if (selectionMode === "sessions" && client) {
      selectFirstNSessions(parseInt(numSessions) || 1);
    }
  }, [numSessions, client, selectionMode, selectFirstNSessions]);

  useEffect(() => {
    if (selectionMode === "amount" && client) {
      selectByAmount(parseFloat(targetAmount) || 0);
    }
  }, [targetAmount, client, selectionMode, selectByAmount]);

  const calculateSelectedTotal = () => {
    if (!client) return 0;
    
    const totalDebt = calculateDebtFromPayments(
      client.unpaidSessions.filter(s => selectedPayments.has(s.paymentId))
    );
    
    // אם במצב תשלום לפי סכום - הצג את הסכום שהוזן (או את החוב אם קטן יותר)
    if (selectionMode === "amount" && targetAmount) {
      const amount = parseFloat(targetAmount);
      return Math.min(amount, totalDebt);
    }
    
    return totalDebt;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">מטופל לא נמצא</p>
        <Button asChild>
          <Link href="/dashboard/payments">חזרה לתשלומים</Link>
        </Button>
      </div>
    );
  }

  if (client.unpaidSessions.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/payments">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">תשלום חובות - {client.name}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-16 w-16 text-green-500 mb-4 opacity-50" />
            <p className="text-lg font-medium">אין חובות לשלם! 🎉</p>
            <p className="text-sm text-muted-foreground mt-2">כל התשלומים שולמו</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedTotal = calculateSelectedTotal();
  const selectedPaymentsList = client.unpaidSessions.filter(s => selectedPayments.has(s.paymentId));

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <CreditCard className="h-6 w-6" />
              תשלום חובות - {client.name}
            </h1>
            <p className="text-muted-foreground">
              {client.unpaidSessions.length} פגישות ממתינות לתשלום
            </p>
          </div>
        </div>
        <AddCreditDialog
          clientId={client.id}
          clientName={client.name}
          currentCredit={client.creditBalance}
          trigger={
            <Button variant="outline" className="gap-2">
              <Wallet className="h-4 w-4" />
              הוסף קרדיט
            </Button>
          }
        />
      </div>

      {/* Quick Payment Card - Pay All */}
      <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-green-600" />
                תשלום מהיר על כל החובות
              </h3>
              <p className="text-sm text-muted-foreground">
                שלם את כל {client.unpaidSessions.length} הפגישות ביחד
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-bold text-green-600">
                  ₪{client.totalDebt.toFixed(0)}
                </span>
                {client.creditBalance > 0 && (
                  <Badge className="bg-sky-50 text-sky-900 font-semibold border border-sky-200">
                    קרדיט: ₪{client.creditBalance.toFixed(0)}
                  </Badge>
                )}
              </div>
            </div>
            <PayClientDebts
              clientId={client.id}
              clientName={client.name}
              totalDebt={client.totalDebt}
              creditBalance={client.creditBalance}
              unpaidPayments={client.unpaidSessions.map(s => ({
                paymentId: s.paymentId,
                amount: s.expectedAmount - s.amount
              }))}
              dateRange={client.unpaidSessions.length > 0 ? {
                from: client.unpaidSessions[0].date,
                to: client.unpaidSessions[client.unpaidSessions.length - 1].date
              } : undefined}
              onPaymentComplete={() => {
                toast.success("התשלום בוצע בהצלחה!");
                router.push("/dashboard/payments");
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Selection Mode Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            או בחר אופן תשלום מותאם אישית
          </CardTitle>
          <CardDescription>
            בחר כמה פגישות תרצה לשלם או לפי סכום מסוים
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={selectionMode} onValueChange={(value) => handleSelectionModeChange(value as SelectionMode)}>
            {/* By Number of Sessions */}
            <div className={`flex items-center space-x-2 space-x-reverse p-3 border-2 rounded-lg transition-all ${
              selectionMode === "sessions" 
                ? "border-primary bg-primary/5 shadow-md" 
                : "border-border hover:bg-slate-50"
            }`}>
              <RadioGroupItem value="sessions" id="sessions" />
              <Label htmlFor="sessions" className="flex-1 cursor-pointer">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    <p className="font-medium">תשלום לפי מספר פגישות</p>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="number"
                      min="1"
                      max={client.unpaidSessions.length}
                      value={numSessions}
                      onChange={(e) => {
                        setNumSessions(e.target.value);
                        if (selectionMode === "sessions") {
                          selectFirstNSessions(parseInt(e.target.value) || 1);
                        }
                      }}
                      className="w-24"
                      disabled={selectionMode !== "sessions"}
                    />
                    <span className="text-sm text-muted-foreground">
                      פגישות ראשונות (לפי תאריך)
                    </span>
                  </div>
                </div>
              </Label>
            </div>

            {/* By Amount */}
            <div className={`flex items-center space-x-2 space-x-reverse p-3 border-2 rounded-lg transition-all ${
              selectionMode === "amount" 
                ? "border-primary bg-primary/5 shadow-md" 
                : "border-border hover:bg-slate-50"
            }`}>
              <RadioGroupItem value="amount" id="amount" />
              <Label htmlFor="amount" className="flex-1 cursor-pointer">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4" />
                    <p className="font-medium">תשלום לפי סכום</p>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="number"
                      min="0"
                      max={client.totalDebt}
                      value={targetAmount}
                      onChange={(e) => {
                        setTargetAmount(e.target.value);
                        if (selectionMode === "amount") {
                          selectByAmount(parseFloat(e.target.value) || 0);
                        }
                      }}
                      className="w-32"
                      placeholder="0"
                      disabled={selectionMode !== "amount"}
                    />
                    <span className="text-sm text-muted-foreground">
                      ₪ (ישלם על פגישות עד לסכום זה)
                    </span>
                  </div>
                </div>
              </Label>
            </div>

            {/* Manual Selection */}
            <div className={`flex items-center space-x-2 space-x-reverse p-3 border-2 rounded-lg transition-all ${
              selectionMode === "manual" 
                ? "border-primary bg-primary/5 shadow-md" 
                : "border-border hover:bg-slate-50"
            }`}>
              <RadioGroupItem value="manual" id="manual" />
              <Label htmlFor="manual" className="flex-1 cursor-pointer">
                <div>
                  <p className="font-medium">בחירה ידנית</p>
                  <p className="text-sm text-muted-foreground">
                    בחר באופן ידני אילו פגישות לשלם (לחץ על הפגישות למטה)
                  </p>
                  {selectionMode === "manual" && (
                    <p className="text-sm text-primary font-medium mt-2 animate-pulse">
                      ← עכשיו לחץ על הפגישות שתרצה לשלם מהרשימה למטה
                    </p>
                  )}
                </div>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>סיכום חוב</span>
            {client.creditBalance > 0 && (
              <Badge className="bg-green-50 text-green-900 font-semibold border border-green-200">
                קרדיט זמין: ₪{client.creditBalance.toFixed(0)}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            בחר את הפגישות שברצונך לשלם - התשלום יבוצע לפי סדר התאריכים
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/30 rounded-lg">
              <p className="text-sm text-muted-foreground">סה"כ חוב</p>
              <p className="text-2xl font-bold text-red-600">₪{client.totalDebt.toFixed(0)}</p>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 rounded-lg">
              <p className="text-sm text-muted-foreground">נבחרו לתשלום</p>
              <p className="text-2xl font-bold text-green-600">₪{selectedTotal.toFixed(0)}</p>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30 rounded-lg col-span-2 md:col-span-1">
              <p className="text-sm text-muted-foreground">יישאר לשלם</p>
              <p className="text-2xl font-bold text-red-600">
                ₪{(client.totalDebt - selectedTotal).toFixed(0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>פגישות לתשלום</CardTitle>
            <CardDescription>
              {selectionMode === "manual" 
                ? "לחץ על פגישה לבחור/לבטל - הישנות ביותר קודם" 
                : "הפגישות שנבחרו לתשלום - לפי הבחירה למעלה"
              }
            </CardDescription>
          </div>
          {selectionMode === "manual" && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAll}
            >
              {selectedPayments.size === client.unpaidSessions.length ? "בטל הכל" : "בחר הכל"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {client.unpaidSessions.map((session, index) => {
            const debt = session.expectedAmount - session.amount;
            const isSelected = selectedPayments.has(session.paymentId);
            const isManualMode = selectionMode === "manual";
            
            return (
              <div
                key={session.paymentId}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                  isManualMode ? 'cursor-pointer' : 'cursor-default'
                } ${
                  isSelected 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => isManualMode && togglePayment(session.paymentId)}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => isManualMode && togglePayment(session.paymentId)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={!isManualMode}
                />
                
                <div className="text-center min-w-[60px]">
                  <div className="text-lg font-bold">
                    {format(new Date(session.date), "d")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(session.date), "MMM", { locale: he })}
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">
                      פגישה מ-{format(new Date(session.date), "dd/MM/yyyy")}
                    </p>
                    {index === 0 && (
                      <Badge variant="outline" className="text-xs">הישנה ביותר</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {session.amount > 0
                      ? `שולם חלקית: ₪${session.amount.toFixed(0)} מתוך ₪${session.expectedAmount.toFixed(0)}`
                      : `טרם שולם`
                    }
                  </p>
                  {session.amount > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min((session.amount / session.expectedAmount) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="text-left">
                  <p className="text-xl font-bold text-red-600">₪{debt.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">לתשלום</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Payment Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">סה"כ לתשלום:</p>
              <p className="text-3xl font-bold">₪{selectedTotal.toFixed(0)}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href="/dashboard/payments">ביטול</Link>
              </Button>
              {client.unpaidSessions.length > 0 && (
                <PayClientDebts
                  clientId={client.id}
                  clientName={client.name}
                  totalDebt={selectedTotal}
                  creditBalance={client.creditBalance}
                  unpaidPayments={selectedPaymentsList.map(s => ({
                    paymentId: s.paymentId,
                    amount: s.expectedAmount - s.amount
                  }))}
                  dateRange={selectedPaymentsList.length > 0 ? {
                    from: selectedPaymentsList[0].date,
                    to: selectedPaymentsList[selectedPaymentsList.length - 1].date
                  } : undefined}
                  onPaymentComplete={() => {
                    toast.success("התשלום בוצע בהצלחה!");
                    router.push("/dashboard/payments");
                  }}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
