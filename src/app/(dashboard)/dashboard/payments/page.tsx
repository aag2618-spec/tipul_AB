"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Home
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";

interface UnpaidSession {
  paymentId: string;
  sessionId: string | null;
  date: Date;
  amount: number;
  paidAmount: number;
  partialPaymentDate?: Date;
}

interface PaymentHistoryItem {
  id: string;
  date: Date;
  amount: number;
  sessionDates: Date[];
  isPartial: boolean;
}

interface ClientDebt {
  id: string;
  fullName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: UnpaidSession[];
  paymentHistory?: PaymentHistoryItem[];
}

type ViewMode = "summary" | "clients" | "clientDetail";
type ClientFilterMode = "all" | "specific";
type DateFilterMode = "all" | "specific";
type HistoryViewMode = "debts" | "history";

export default function PaymentsPage() {
  // מצבים ראשיים
  const [isLoading, setIsLoading] = useState(true);
  const [clients, setClients] = useState<ClientDebt[]>([]);
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
        
        {/* כותרת */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">חובות וקרדיט</h1>
          <p className="text-muted-foreground">
            {filteredClients.length} מטופלים
          </p>
        </div>

        {/* טאבים */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* טאב 1: כל המטופלים / מטופל ספציפי */}
          <Card>
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

          {/* טאב 2: חיפוש לפי תאריך */}
          <Card>
            <CardContent className="p-4">
              <Tabs value={dateFilterMode} onValueChange={(v) => setDateFilterMode(v as DateFilterMode)}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="all">כל התאריכים</TabsTrigger>
                  <TabsTrigger value="specific">תאריך ספציפי</TabsTrigger>
                </TabsList>
                <TabsContent value="specific" className="mt-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "בחר תאריך"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        locale={he}
                      />
                    </PopoverContent>
                  </Popover>
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
        </Tabs>

        {/* רשימת מטופלים במלבנים */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
            filteredClients.map((client) => (
              <Card 
                key={client.id}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
                onClick={() => {
                  setSelectedClient(client);
                  setViewMode("clientDetail");
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {client.unpaidSessionsCount} פגישות
                    </span>
                  </div>
                  
                  <h3 className="font-semibold text-lg mb-3">{client.fullName}</h3>
                  
                  <div className="space-y-2">
                    {client.totalDebt > 0 && (
                      <div className="flex justify-between items-center">
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          חוב
                        </Badge>
                        <span className="font-bold text-red-600">₪{client.totalDebt.toFixed(0)}</span>
                      </div>
                    )}
                    
                    {client.creditBalance > 0 && (
                      <div className="flex justify-between items-center">
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
            ))
          )}
        </div>
      </div>
    );
  }

  // ========== תצוגת פירוט מטופל ==========
  if (viewMode === "clientDetail" && selectedClient) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Breadcrumbs */}
        <Breadcrumbs />
        
        {/* כותרת */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{selectedClient.fullName}</h1>
          <p className="text-muted-foreground">
            פירוט תשלומים
          </p>
        </div>

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
                  <Card key={session.paymentId} className="hover:shadow-md transition-shadow">
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
                            {session.partialPaymentDate && (
                              <div className="text-xs text-muted-foreground">
                                תאריך תשלום: {format(new Date(session.partialPaymentDate), "dd/MM/yyyy")}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {/* היסטוריית תשלומים */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <History className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-lg font-medium">היסטוריית תשלומים תתווסף בשלב הבא</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <Link href={`/dashboard/clients/${selectedClient.id}?tab=payments`}>
                      צפה בהיסטוריה המלאה
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* כפתור תשלום */}
        {selectedClient.totalDebt > 0 && (
          <div className="flex justify-center">
            <Button size="lg" className="gap-2 bg-green-600 hover:bg-green-700" asChild>
              <Link href={`/dashboard/payments/pay/${selectedClient.id}`}>
                <CreditCard className="h-5 w-5" />
                שלם עכשיו
              </Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
