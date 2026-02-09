"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
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
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Search, 
  Calendar as CalendarIcon,
  CreditCard,
  ArrowRight,
  Clock,
  Wallet,
  History,
  ChevronLeft,
  Mail,
  Download,
  TrendingUp
} from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { PaymentHistoryItem } from "@/components/payments/payment-history-item";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UnpaidSession {
  paymentId: string;
  sessionId: string | null;
  date: Date;
  amount: number;
  paidAmount: number;
  partialPaymentDate?: Date;
}

interface ChildPayment {
  id: string;
  amount: number;
  method: string;
  paidAt: Date | null;
  createdAt: Date;
}

interface PaidPayment {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  expectedAmount: number;
  method: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  session: {
    id: string;
    startTime: Date;
    type: string;
  } | null;
  childPayments: ChildPayment[];
}

interface ClientDebt {
  id: string;
  fullName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: UnpaidSession[];
}

type ViewMode = "summary" | "clients" | "clientDetail";
type ClientFilterMode = "all" | "specific";
type DateFilterMode = "all" | "specific";
type HistoryViewMode = "debts" | "history";

export default function PaymentsPage() {
  // מצבים ראשיים
  const [isLoading, setIsLoading] = useState(true);
  const [clients, setClients] = useState<ClientDebt[]>([]);
  const [paidPayments, setPaidPayments] = useState<PaidPayment[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  
  // מסננים
  const [clientFilterMode, setClientFilterMode] = useState<ClientFilterMode>("all");
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedClient, setSelectedClient] = useState<ClientDebt | null>(null);
  const [historyViewMode, setHistoryViewMode] = useState<HistoryViewMode>("debts");
  
  // סטטיסטיקות
  const [totalDebt, setTotalDebt] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  
  // תשלום מהיר
  const [selectedPaymentSession, setSelectedPaymentSession] = useState<UnpaidSession | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  
  // שליחת מיילים
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingAllEmails, setIsSendingAllEmails] = useState(false);
  
  // סינון לפי חודש
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  // יצירת רשימת חודשים (12 חודשים אחרונים)
  const monthOptions = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = subMonths(now, i);
      const value = format(date, "yyyy-MM");
      const label = format(date, "MMMM yyyy", { locale: he });
      months.push({ value, label });
    }
    return months;
  }, []);

  // נתוני גרף - תשלומים לפי חודשים
  const chartData = useMemo(() => {
    const monthlyTotals: { [key: string]: number } = {};
    
    // אתחול 6 חודשים אחרונים
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "yyyy-MM");
      monthlyTotals[key] = 0;
    }
    
    // סכימת תשלומים לפי חודש
    paidPayments.forEach((payment) => {
      const paymentDate = payment.paidAt ? new Date(payment.paidAt) : new Date(payment.createdAt);
      const key = format(paymentDate, "yyyy-MM");
      if (monthlyTotals[key] !== undefined) {
        monthlyTotals[key] += payment.amount;
      }
    });
    
    return Object.entries(monthlyTotals).map(([month, total]) => ({
      month: format(new Date(month + "-01"), "MMM", { locale: he }),
      total: Math.round(total),
    }));
  }, [paidPayments]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // טעינת חובות מטופלים
      const debtsResponse = await fetch("/api/payments/client-debts");
      if (debtsResponse.ok) {
        const data = await debtsResponse.json();
        setClients(data);
        
        // חישוב סטטיסטיקות
        const debt = data.reduce((sum: number, c: ClientDebt) => sum + c.totalDebt, 0);
        const credit = data.reduce((sum: number, c: ClientDebt) => sum + c.creditBalance, 0);
        setTotalDebt(debt);
        setTotalCredit(credit);
      }
      
      // טעינת תשלומים החודש
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyResponse = await fetch(`/api/payments/monthly-total?start=${startOfMonth.toISOString()}`);
      if (monthlyResponse.ok) {
        const monthlyData = await monthlyResponse.json();
        setPaidThisMonth(monthlyData.total || 0);
      }
      
      // טעינת היסטוריית תשלומים (תשלומים ששולמו)
      const paidResponse = await fetch("/api/payments/paid-history");
      if (paidResponse.ok) {
        const paidData = await paidResponse.json();
        setPaidPayments(paidData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setIsLoading(false);
    }
  };

  // סינון מטופלים
  const getFilteredClients = () => {
    let filtered = clients.filter(c => c.totalDebt > 0 || c.creditBalance > 0);
    
    // סינון לפי חיפוש
    if (searchTerm && clientFilterMode === "specific") {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(c => c.fullName.toLowerCase().includes(search));
    }
    
    // סינון לפי תאריך
    if (dateFilterMode === "specific" && selectedDate) {
      filtered = filtered.map(client => ({
        ...client,
        unpaidSessions: client.unpaidSessions.filter(session => {
          const sessionDate = new Date(session.date);
          return (
            sessionDate.getDate() === selectedDate.getDate() &&
            sessionDate.getMonth() === selectedDate.getMonth() &&
            sessionDate.getFullYear() === selectedDate.getFullYear()
          );
        }),
        totalDebt: client.unpaidSessions
          .filter(session => {
            const sessionDate = new Date(session.date);
            return (
              sessionDate.getDate() === selectedDate.getDate() &&
              sessionDate.getMonth() === selectedDate.getMonth() &&
              sessionDate.getFullYear() === selectedDate.getFullYear()
            );
          })
          .reduce((sum, s) => sum + (s.amount - s.paidAmount), 0)
      })).filter(c => c.unpaidSessions.length > 0);
    }
    
    return filtered;
  };

  // חזרה לתצוגה קודמת
  const goBack = () => {
    if (viewMode === "clientDetail") {
      setViewMode("clients");
      setSelectedClient(null);
    } else if (viewMode === "clients") {
      setViewMode("summary");
    }
  };

  // שליחת מייל תזכורת למטופל בודד
  const sendDebtReminder = async (clientId: string, clientName: string) => {
    setIsSendingEmail(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/send-debt-reminder`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "שגיאה בשליחת התזכורת");
      }
      toast.success(`תזכורת נשלחה בהצלחה ל-${clientName}!`);
    } catch (error: any) {
      toast.error(error.message || "שגיאה בשליחת התזכורת");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // שליחת מייל לכל המטופלים
  const sendDebtReminderToAll = async () => {
    const clientsWithDebt = clients.filter(c => c.totalDebt > 0);
    if (clientsWithDebt.length === 0) {
      toast.info("אין מטופלים עם חוב");
      return;
    }
    
    setIsSendingAllEmails(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const client of clientsWithDebt) {
      try {
        const res = await fetch(`/api/clients/${client.id}/send-debt-reminder`, {
          method: "POST",
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    
    setIsSendingAllEmails(false);
    if (failCount === 0) {
      toast.success(`נשלחו ${successCount} תזכורות בהצלחה!`);
    } else {
      toast.info(`נשלחו ${successCount} תזכורות, ${failCount} נכשלו`);
    }
  };

  // רכיב Breadcrumbs לניווט
  const Breadcrumbs = () => {
    const items = [
      { label: "תשלומים", onClick: () => { setViewMode("summary"); setSelectedClient(null); } }
    ];
    
    if (viewMode === "clients" || viewMode === "clientDetail") {
      items.push({ 
        label: "כל המטופלים", 
        onClick: () => { setViewMode("clients"); setSelectedClient(null); } 
      });
    }
    
    if (viewMode === "clientDetail" && selectedClient) {
      items.push({ 
        label: selectedClient.fullName, 
        onClick: () => {} 
      });
    }

    return (
      <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-1">
            {index > 0 && <ChevronLeft className="h-4 w-4" />}
            <button
              onClick={item.onClick}
              className={`hover:text-primary transition-colors ${
                index === items.length - 1 ? "text-foreground font-medium" : ""
              }`}
              disabled={index === items.length - 1}
            >
              {item.label}
            </button>
          </div>
        ))}
      </nav>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ========== תצוגת סיכום ראשית ==========
  if (viewMode === "summary") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תשלומים וחובות</h1>
          <p className="text-muted-foreground">סיכום כללי של כל המטופלים</p>
        </div>

        {/* 2 מלבנים ראשיים */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* מלבן חוב/קרדיט - לחיץ */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] bg-gradient-to-br from-red-50 to-orange-50 border-red-200"
            onClick={() => setViewMode("clients")}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-red-100">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold">חובות וקרדיט</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">סך חובות:</span>
                  <span className="text-2xl font-bold text-red-600">₪{totalDebt.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">סך קרדיט:</span>
                  <span className="text-xl font-bold text-green-600">₪{totalCredit.toFixed(0)}</span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    {clients.filter(c => c.totalDebt > 0).length} מטופלים עם חוב
                  </p>
                </div>
              </div>
              <div className="mt-4 text-sm text-primary flex items-center gap-1">
                לחץ לצפייה בפירוט
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>

          {/* מלבן שולם החודש */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold">שולם החודש</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">סה"כ:</span>
                  <span className="text-2xl font-bold text-green-600">₪{paidThisMonth.toFixed(0)}</span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(), "MMMM yyyy", { locale: he })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ========== תצוגת רשימת מטופלים ==========
  if (viewMode === "clients") {
    const filteredClients = getFilteredClients();
    
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Breadcrumbs */}
        <Breadcrumbs />
        
        {/* כותרת עם כפתור מייל לכולם */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">חובות וקרדיט</h1>
            <p className="text-muted-foreground">
              {filteredClients.length} מטופלים
            </p>
          </div>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={sendDebtReminderToAll}
            disabled={isSendingAllEmails}
          >
            {isSendingAllEmails ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            שלח תזכורת לכל המטופלים
          </Button>
        </div>

        {/* סינון */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* סינון 1: מטופל */}
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <Tabs value={clientFilterMode} onValueChange={(v) => setClientFilterMode(v as ClientFilterMode)}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="all">כל המטופלים</TabsTrigger>
                  <TabsTrigger value="specific">מטופל ספציפי</TabsTrigger>
                </TabsList>
                <TabsContent value="specific" className="mt-4">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="חפש לפי שם..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-10"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* סינון 2: תאריך */}
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <Tabs value={dateFilterMode} onValueChange={(v) => setDateFilterMode(v as DateFilterMode)}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="all">כל התאריכים</TabsTrigger>
                  <TabsTrigger value="specific">תאריך ספציפי</TabsTrigger>
                </TabsList>
                <TabsContent value="specific" className="mt-4">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "בחר תאריך"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-auto p-4">
                      <DialogHeader>
                        <DialogTitle>בחר תאריך</DialogTitle>
                      </DialogHeader>
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        locale={he}
                      />
                    </DialogContent>
                  </Dialog>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* טאב היסטוריה / חובות */}
        <Tabs value={historyViewMode} onValueChange={(v) => setHistoryViewMode(v as HistoryViewMode)}>
          <TabsList>
            <TabsTrigger value="debts" className="gap-2">
              <Wallet className="h-4 w-4" />
              חובות פתוחים
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              היסטוריית תשלומים
            </TabsTrigger>
          </TabsList>

          {/* חובות פתוחים - רשימת מטופלים */}
          <TabsContent value="debts" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="h-16 w-16 text-green-500 mb-4 opacity-50" />
                    <p className="text-lg font-medium">
                      {searchTerm ? "לא נמצאו תוצאות לחיפוש" : "אין חובות פתוחים"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredClients.map((client) => {
                  // כשמסננים לפי תאריך - מציגים את מספר הפגישות המסוננות
                  const sessionsCount = dateFilterMode === "specific" && selectedDate 
                    ? client.unpaidSessions.length 
                    : client.unpaidSessionsCount;
                  
                  return (
                    <Card 
                      key={client.id}
                      className="cursor-pointer bg-gradient-to-br from-rose-50/80 to-orange-50/50 border-rose-100 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 rounded-xl"
                      onClick={() => {
                        setSelectedClient(client);
                        setViewMode("clientDetail");
                      }}
                    >
                      <CardContent className="p-4">
                        {/* הצגת תאריך כשמסננים לפי תאריך ספציפי */}
                        {dateFilterMode === "specific" && selectedDate && (
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-rose-100">
                            <div className="p-1.5 bg-primary/10 rounded-full">
                              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-sm font-medium text-primary">
                              {format(selectedDate, "dd/MM/yyyy")}
                            </span>
                          </div>
                        )}
                        
                        {/* מספר פגישות - רק אם יש יותר מאחת או אם לא מסננים לפי תאריך */}
                        {(dateFilterMode !== "specific" || sessionsCount > 1) && (
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {sessionsCount} פגישות
                            </span>
                          </div>
                        )}
                        
                        <h3 className="font-semibold text-lg mb-3">{client.fullName}</h3>
                        
                        <div className="space-y-2">
                          {client.totalDebt > 0 && (
                            <div className="flex justify-between items-center bg-white/60 rounded-lg p-2">
                              <Badge variant="destructive" className="gap-1">
                                <AlertCircle className="h-3 w-3" />
                                חוב
                              </Badge>
                              <span className="font-bold text-lg text-red-600">₪{client.totalDebt.toFixed(0)}</span>
                            </div>
                          )}
                          
                          {client.creditBalance > 0 && (
                            <div className="flex justify-between items-center bg-white/60 rounded-lg p-2">
                              <Badge className="gap-1 bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3" />
                                קרדיט
                              </Badge>
                              <span className="font-bold text-green-600">₪{client.creditBalance.toFixed(0)}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* היסטוריית תשלומים */}
          <TabsContent value="history" className="mt-4 space-y-6">
            {/* גרף קו - תשלומים לפי חודשים */}
            <Card className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border-emerald-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-emerald-900">מגמת תשלומים - 6 חודשים אחרונים</h3>
                  </div>
                  {/* כפתורי ייצוא */}
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-1.5 bg-white/80 hover:bg-white border-emerald-200 text-emerald-700 hover:text-emerald-800"
                      onClick={() => toast.info("ייצוא ל-PDF בקרוב...")}
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-1.5 bg-white/80 hover:bg-white border-emerald-200 text-emerald-700 hover:text-emerald-800"
                      onClick={() => toast.info("ייצוא ל-Excel בקרוב...")}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Excel
                    </Button>
                  </div>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        tickFormatter={(value) => `₪${value}`}
                      />
                      <Tooltip 
                        formatter={(value) => [`₪${value}`, "סה״כ"]}
                        labelStyle={{ fontWeight: "bold" }}
                        contentStyle={{ 
                          backgroundColor: "white", 
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="total" 
                        stroke="#10b981" 
                        strokeWidth={3}
                        dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: "#059669" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* סינון לפי חודש */}
            <div className="flex items-center gap-3">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[200px] bg-white shadow-sm">
                  <CalendarIcon className="h-4 w-4 ml-2 text-muted-foreground" />
                  <SelectValue placeholder="כל החודשים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל החודשים</SelectItem>
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedMonth !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  מסנן לפי חודש
                </Badge>
              )}
            </div>

            {/* רשימת תשלומים */}
            {(() => {
              // סינון היסטוריית תשלומים לפי מסננים
              let filteredHistory = paidPayments;
              
              // סינון לפי מטופל ספציפי
              if (searchTerm && clientFilterMode === "specific") {
                const search = searchTerm.toLowerCase();
                filteredHistory = filteredHistory.filter(p => 
                  p.clientName.toLowerCase().includes(search)
                );
              }
              
              // סינון לפי תאריך ספציפי
              if (dateFilterMode === "specific" && selectedDate) {
                filteredHistory = filteredHistory.filter(p => {
                  const paymentDate = p.paidAt ? new Date(p.paidAt) : new Date(p.createdAt);
                  return (
                    paymentDate.getDate() === selectedDate.getDate() &&
                    paymentDate.getMonth() === selectedDate.getMonth() &&
                    paymentDate.getFullYear() === selectedDate.getFullYear()
                  );
                });
              }
              
              // סינון לפי חודש
              if (selectedMonth !== "all") {
                filteredHistory = filteredHistory.filter(p => {
                  const paymentDate = p.paidAt ? new Date(p.paidAt) : new Date(p.createdAt);
                  const paymentMonth = format(paymentDate, "yyyy-MM");
                  return paymentMonth === selectedMonth;
                });
              }

              if (filteredHistory.length === 0) {
                return (
                  <Card className="bg-gradient-to-br from-slate-50 to-gray-50">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <History className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                      <p className="text-lg font-medium">
                        {searchTerm || selectedDate || selectedMonth !== "all" 
                          ? "לא נמצאו תשלומים לפי הסינון" 
                          : "אין תשלומים שהושלמו"}
                      </p>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredHistory.map((payment) => (
                      <div key={payment.id} className="space-y-2">
                        {/* שם מטופל */}
                        <div className="flex items-center gap-2 px-1">
                          <Badge variant="outline" className="font-medium">
                            {payment.clientName}
                          </Badge>
                        </div>
                        {/* פרטי התשלום */}
                        <PaymentHistoryItem
                          payment={{
                            id: payment.id,
                            amount: payment.amount,
                            expectedAmount: payment.expectedAmount,
                            method: payment.method,
                            status: payment.status,
                            createdAt: payment.createdAt,
                            paidAt: payment.paidAt,
                            session: payment.session,
                            childPayments: payment.childPayments,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  
                  {/* סיכום */}
                  <div className="text-sm text-muted-foreground text-center mt-4 py-3 bg-gradient-to-r from-transparent via-slate-100 to-transparent rounded-full">
                    מציג {filteredHistory.length} מתוך {paidPayments.length} תשלומים
                  </div>
                </>
              );
            })()}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ========== תצוגת פירוט מטופל ==========
  if (viewMode === "clientDetail" && selectedClient) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Breadcrumbs */}
        <Breadcrumbs />
        
        {/* כותרת עם כפתורי פעולה */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{selectedClient.fullName}</h1>
            <p className="text-muted-foreground">פירוט תשלומים</p>
          </div>
          <div className="flex gap-2">
            {/* כפתור שליחת מייל */}
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => sendDebtReminder(selectedClient.id, selectedClient.fullName)}
              disabled={isSendingEmail}
            >
              {isSendingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              שלח תזכורת
            </Button>
          </div>
        </div>

        {/* תשלום מהיר על כלל החובות - למעלה */}
        {selectedClient.totalDebt > 0 && (
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-300">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-green-600" />
                <div>
                  <span className="font-semibold">תשלום מהיר על כלל החובות</span>
                  <p className="text-sm text-muted-foreground">
                    סה"כ: ₪{selectedClient.totalDebt.toFixed(0)} | {selectedClient.unpaidSessionsCount} פגישות
                  </p>
                </div>
              </div>
              <Button className="gap-2 bg-green-600 hover:bg-green-700" asChild>
                <Link href={`/dashboard/payments/pay/${selectedClient.id}`}>
                  <CreditCard className="h-4 w-4" />
                  שלם הכל
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* סיכום מטופל */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span>סך חוב:</span>
              </div>
              <span className="text-xl font-bold text-red-600">₪{selectedClient.totalDebt.toFixed(0)}</span>
            </CardContent>
          </Card>
          
          {selectedClient.creditBalance > 0 && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>קרדיט זמין:</span>
                </div>
                <span className="text-xl font-bold text-green-600">₪{selectedClient.creditBalance.toFixed(0)}</span>
              </CardContent>
            </Card>
          )}
        </div>

        {/* טאב היסטוריה / חובות */}
        <Tabs value={historyViewMode} onValueChange={(v) => setHistoryViewMode(v as HistoryViewMode)}>
          <TabsList>
            <TabsTrigger value="debts" className="gap-2">
              <Wallet className="h-4 w-4" />
              חובות פתוחים
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              היסטוריית תשלומים
            </TabsTrigger>
          </TabsList>

          <TabsContent value="debts" className="mt-4">
            {/* רשימת פגישות לתשלום במלבנים */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedClient.unpaidSessions.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="h-16 w-16 text-green-500 mb-4 opacity-50" />
                    <p className="text-lg font-medium">אין חובות פתוחים</p>
                  </CardContent>
                </Card>
              ) : (
                selectedClient.unpaidSessions.map((session) => (
                  <Card 
                    key={session.paymentId} 
                    className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] hover:border-primary"
                    onClick={() => {
                      setSelectedPaymentSession(session);
                      setIsPaymentDialogOpen(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {format(new Date(session.date), "dd/MM/yyyy", { locale: he })}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">חוב:</span>
                          <span className="font-bold text-red-600">
                            ₪{(session.amount - session.paidAmount).toFixed(0)}
                          </span>
                        </div>
                        
                        {session.paidAmount > 0 && (
                          <>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">שולם חלקית:</span>
                              <span className="text-green-600">₪{session.paidAmount.toFixed(0)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              בתאריך: {session.partialPaymentDate 
                                ? format(new Date(session.partialPaymentDate), "dd/MM/yyyy") 
                                : "לא ידוע"}
                            </div>
                          </>
                        )}
                      </div>
                      
                      <div className="mt-3 pt-2 border-t text-xs text-primary flex items-center gap-1">
                        לחץ לתשלום
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {(() => {
              // סינון היסטוריית תשלומים של המטופל הנבחר
              const clientHistory = paidPayments.filter(p => p.clientId === selectedClient.id);

              if (clientHistory.length === 0) {
                return (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <History className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                      <p className="text-lg font-medium">אין תשלומים שהושלמו</p>
                      <Button variant="outline" className="mt-4 gap-2" asChild>
                        <Link href={`/dashboard/clients/${selectedClient.id}?tab=payments`}>
                          צפה בתיקיית המטופל
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clientHistory.map((payment) => (
                    <PaymentHistoryItem
                      key={payment.id}
                      payment={{
                        id: payment.id,
                        amount: payment.amount,
                        expectedAmount: payment.expectedAmount,
                        method: payment.method,
                        status: payment.status,
                        createdAt: payment.createdAt,
                        paidAt: payment.paidAt,
                        session: payment.session,
                        childPayments: payment.childPayments,
                      }}
                    />
                  ))}
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>

        {/* דיאלוג תשלום מהיר לפגישה בודדת */}
        {selectedPaymentSession && (
          <QuickMarkPaid
            sessionId={selectedPaymentSession.sessionId || ""}
            clientId={selectedClient.id}
            clientName={selectedClient.fullName}
            amount={selectedPaymentSession.amount - selectedPaymentSession.paidAmount}
            creditBalance={selectedClient.creditBalance}
            existingPayment={{ id: selectedPaymentSession.paymentId, status: "PENDING" }}
            buttonText="תשלום"
            open={isPaymentDialogOpen}
            onOpenChange={(open) => {
              setIsPaymentDialogOpen(open);
              if (!open) {
                setSelectedPaymentSession(null);
                // רענון הנתונים אחרי תשלום
                fetchData();
              }
            }}
            hideButton={true}
          />
        )}
      </div>
    );
  }

  return null;
}
