"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
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
  TrendingUp,
  Sparkles,
  Star,
  BellOff
} from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { ChargeCardcomDialog } from "@/components/payments/charge-cardcom-dialog";
import { PaymentHistoryItem } from "@/components/payments/payment-history-item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  exportDetailedExcel,
  exportDetailedPDF,
  type PaymentExportData,
} from "@/lib/export-utils";
import { getTherapistAccent } from "@/lib/calendar/event-colors";
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
  date: Date | string;
  amount: number;
  paidAmount: number;
  partialPaymentDate?: Date | string;
}

interface ChildPayment {
  id: string;
  amount: number;
  method: string;
  paidAt: Date | string | null;
  createdAt: Date | string;
}

interface PaidPayment {
  id: string;
  clientId: string;
  clientName: string;
  therapistId: string | null;
  therapistName: string | null;
  amount: number;
  expectedAmount: number;
  method: string;
  status: string;
  paidAt: Date | string | null;
  createdAt: Date | string;
  session: {
    id: string;
    startTime: Date | string;
    type: string;
  } | null;
  childPayments: ChildPayment[];
}

interface ClientDebt {
  id: string;
  fullName: string;
  therapistId: string | null;
  therapistName: string | null;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: UnpaidSession[];
  // דחיית התראת החוב ("אל תזכיר לי") — תאריך עתידי = נדחה; null/עבר = פעיל.
  snoozeUntil?: Date | string | null;
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
  const [chartMonthlyData, setChartMonthlyData] = useState<{ month: string; total: number }[]>([]);
  
  // תשלום מהיר
  const [selectedPaymentSession, setSelectedPaymentSession] = useState<UnpaidSession | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

  // Cardcom dialog ברמת העמוד — חיוני כדי שלא יעלם כש-QuickMarkPaid יורד
  // מה-DOM (selectedPaymentSession=null אחרי close). אותו דפוס כמו בעמוד היומן.
  const [cardcomData, setCardcomData] = useState<{
    paymentId?: string;
    sessionId?: string;
    clientId: string;
    clientName: string;
    clientPhone?: string | null;
    clientEmail?: string | null;
    amount: number;
  } | null>(null);
  const [cardcomOpen, setCardcomOpen] = useState(false);

  // דחיית התראת חוב ("אל תזכיר לי") — בורר שבוע/חודש + דיאלוג תאריך מותאם.
  const [snoozeDateClient, setSnoozeDateClient] = useState<ClientDebt | null>(null);
  const [snoozeCustomDate, setSnoozeCustomDate] = useState<Date | undefined>(undefined);
  const [snoozeBusy, setSnoozeBusy] = useState<string | null>(null);

  // שליחת מיילים
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingAllEmails, setIsSendingAllEmails] = useState(false);
  
  // סינון לפי חודש
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  // דפדוף היסטוריה
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextHistorySkip, setNextHistorySkip] = useState(0);

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

  // נתוני גרף - תשלומים לפי חודשים (מגיע מה-API, אותו חישוב כמו "שולם החודש")
  const chartData = useMemo(() => {
    if (chartMonthlyData.length > 0) {
      return chartMonthlyData.map((item) => ({
        month: format(new Date(item.month + "-01"), "MMM", { locale: he }),
        total: Math.round(item.total),
      }));
    }
    // fallback - אם אין נתונים מה-API, הצג ריק
    return Array.from({ length: 6 }, (_, i) => ({
      month: format(subMonths(new Date(), 5 - i), "MMM", { locale: he }),
      total: 0,
    }));
  }, [chartMonthlyData]);

  // היקף תצוגה "שלי / כל הקליניקה" — נקרא מה-cookie בכל render. כשהמתג מתחלף
  // (cookie + router.refresh) הערך משתנה, וה-effects של טעינת הנתונים רצים מחדש
  // ומושכים מהשרת את ההיקף הנכון. בלי זה העמוד "מצלם" את הנתונים פעם אחת בטעינה.
  const viewScope =
    typeof document !== "undefined" &&
    /(?:^|;\s*)mytipul_view=clinic/.test(document.cookie)
      ? "clinic"
      : "personal";

  // סימון המטפל מוצג גם למזכירה: היא רואה את כל הקליניקה (אין לה מתג
  // "שלי / כל הקליניקה"), ולכן צריכה לדעת של איזה מטפל כל תשלום. הנתון (שם
  // המטפל) כבר נשלח אליה מהשרת — כאן רק מבטלים הסתרה. הזיהוי זהה ל-isSecretary
  // בשרת (clinicRole, או role הישן CLINIC_SECRETARY) — שניהם מגיעים ב-session.
  const { data: authSession } = useSession();
  const isSecretary =
    authSession?.user?.clinicRole === "SECRETARY" ||
    authSession?.user?.role === "CLINIC_SECRETARY";
  const showTherapistMarker = viewScope === "clinic" || isSecretary;

  useEffect(() => {
    fetchData();
  }, [viewScope]);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // קריאה אחת מאוחדת — חובות + סיכום חודשי + היסטוריה
      const response = await fetch("/api/payments/dashboard", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();

        // חובות מטופלים
        if (data.debts) {
          setClients(data.debts);
          const debt = data.debts.reduce((sum: number, c: ClientDebt) => sum + c.totalDebt, 0);
          const credit = data.debts.reduce((sum: number, c: ClientDebt) => sum + c.creditBalance, 0);
          setTotalDebt(debt);
          setTotalCredit(credit);
          setSelectedClient((prev) => {
            if (!prev) return null;
            const updated = data.debts.find((c: ClientDebt) => c.id === prev.id);
            return updated || null;
          });
        }

        // סיכום חודשי + גרף
        if (data.monthly) {
          setPaidThisMonth(data.monthly.total || 0);
          if (data.monthly.breakdown) {
            setChartMonthlyData(data.monthly.breakdown);
          }
        }

        // היסטוריית תשלומים — נטענת ע"י ה-effect של selectedMonth
        // (ראה למטה). לא טוענים כאן כדי למנוע race שבו data.history
        // ה-"all" ימחק תוצאת month-filter שכבר נטענה.
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setIsLoading(false);
    }
  };

  // ── דחיית התראת חוב ("אל תזכיר לי") ───────────────────────────────
  // הדחייה מורידה את המטופל מהעיגול שבתפריט ומסמנת "נדחה עד..." בכרטיס, אבל
  // משאירה אותו ברשימת החובות (הוא עדיין חייב). משותף ברמת המטופל בשרת.
  const isSnoozed = (c: ClientDebt) =>
    !!c.snoozeUntil && new Date(c.snoozeUntil).getTime() > Date.now();

  const handleSnooze = async (clientId: string, until: Date) => {
    setSnoozeBusy(clientId);
    try {
      const res = await fetch("/api/payments/snooze-debt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, snoozeUntil: until.toISOString() }),
      });
      if (!res.ok) throw new Error();
      toast.success("התראת החוב נדחתה");
      await fetchData();
    } catch {
      toast.error("שגיאה בדחיית ההתראה");
    } finally {
      setSnoozeBusy(null);
    }
  };

  const handleUnsnooze = async (clientId: string) => {
    setSnoozeBusy(clientId);
    try {
      const res = await fetch("/api/payments/snooze-debt", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error();
      toast.success("הדחייה בוטלה");
      await fetchData();
    } catch {
      toast.error("שגיאה בביטול הדחייה");
    } finally {
      setSnoozeBusy(null);
    }
  };

  const snoozePreset = (clientId: string, days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    void handleSnooze(clientId, d);
  };

  // ── עוזר: בניית query string להיסטוריה ──
  // selectedMonth נשלח ב-server-side כדי לשבור את הרגרסיה שבה ה-UI טען
  // 50 תשלומים אחרונים בלבד וסינן בזיכרון — חודש שכל תשלומיו יותר ישנים
  // מ-50 התשלומים החדשים ביותר היה נראה ריק. עכשיו ה-fetch מתבצע מחדש
  // בכל שינוי של selectedMonth.
  const buildHistoryUrl = useCallback(
    (skip: number, take = 50): string => {
      const params = new URLSearchParams();
      params.set("take", String(take));
      params.set("skip", String(skip));
      if (selectedMonth !== "all") params.set("month", selectedMonth);
      return `/api/payments/paid-history?${params.toString()}`;
    },
    [selectedMonth],
  );

  // עיגון refetch ל-selectedMonth: כשהמטפל בוחר חודש, מתבצעת
  // קריאה חדשה לשרת שמסננת לפי החודש; הסינון בזיכרון נשאר לחיפוש שם
  // ולתאריך ספציפי בלבד (אלה לא יוצרים בעיות scope כי הם מצמצמים
  // את מה שכבר נטען לחודש אחד).
  useEffect(() => {
    let cancelled = false;
    const fetchMonth = async (): Promise<void> => {
      try {
        const res = await fetch(buildHistoryUrl(0), { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const items = data.items || data;
        setPaidPayments(items);
        setHasMoreHistory(data.hasMore ?? false);
        setNextHistorySkip(data.nextSkip ?? 50);
      } catch {
        // silent — fetchData הראשי כבר טיפל ב-toast.error הראשוני.
      }
    };
    // לא לשפוך תשלומים מהחודש הקודם בזמן טעינה — מאפסים.
    setPaidPayments([]);
    setHasMoreHistory(false);
    setNextHistorySkip(0);
    fetchMonth();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, viewScope]);

  const loadMoreHistory = async () => {
    try {
      setIsLoadingMore(true);
      const res = await fetch(buildHistoryUrl(nextHistorySkip), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const items = data.items || data;
        setPaidPayments(prev => [...prev, ...items]);
        setHasMoreHistory(data.hasMore ?? false);
        setNextHistorySkip(data.nextSkip ?? nextHistorySkip + 50);
      }
    } catch {
      toast.error("שגיאה בטעינת תשלומים נוספים");
    } finally {
      setIsLoadingMore(false);
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
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "שגיאה בשליחת התזכורת");
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
    // ── מסך עידוד "סיימת את הגבייה" ──────────────────────────────────
    // מוצג כשאין אף מטופל עם חוב פתוח, אבל יש עדות לפעילות גבייה (שולם החודש /
    // קרדיט / כל אחד מ-6 החודשים האחרונים). הבדיקה על הפעילות מונעת מצב שבו
    // חשבון חדש לגמרי — שמעולם לא גבה — יראה "כל הכבוד שסיימת" סתם.
    const clientsWithDebtCount = clients.filter((c) => c.totalDebt > 0).length;
    const hasCollectionActivity =
      paidThisMonth > 0 ||
      totalCredit > 0 ||
      chartMonthlyData.some((m) => m.total > 0);
    const showCelebration = clientsWithDebtCount === 0 && hasCollectionActivity;

    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תשלומים וחובות</h1>
          <p className="text-muted-foreground">סיכום כללי של כל המטופלים</p>
        </div>

        {/* מסך עידוד על סיום הגבייה — אין חובות פתוחים */}
        {showCelebration && (
          <Card className="relative overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 shadow-sm animate-slide-in-up">
            {/* עיגולי רקע מטושטשים לעומק */}
            <div className="pointer-events-none absolute -top-12 -right-10 h-44 w-44 rounded-full bg-emerald-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-14 -left-10 h-48 w-48 rounded-full bg-teal-200/40 blur-3xl" />
            {/* כוכבים מעטרים */}
            <Star className="pointer-events-none absolute top-6 right-10 h-5 w-5 fill-amber-300 text-amber-300 opacity-70 animate-pulse-subtle" />
            <Star className="pointer-events-none absolute bottom-8 left-12 h-4 w-4 fill-emerald-300 text-emerald-300 opacity-60 animate-pulse-subtle" />
            <Star className="pointer-events-none absolute top-10 left-1/4 h-3 w-3 fill-teal-300 text-teal-300 opacity-50 animate-pulse-subtle" />

            <CardContent className="relative px-6 py-10 text-center sm:py-12">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-500 shadow-lg shadow-emerald-200/60">
                <Sparkles className="h-10 w-10 text-white" />
              </div>
              <h2 className="mb-3 text-2xl font-bold text-emerald-900 sm:text-3xl">
                כל הכבוד! סיימת את הגבייה
              </h2>
              <p className="mx-auto max-w-md text-base leading-relaxed text-emerald-700 sm:text-lg">
                כל המטופלים שילמו ואין חובות פתוחים. סיימת את החלק הכי פחות נעים —
                מגיע לך להרגיש טוב עם זה. עבודה יפה ומסודרת!
              </p>

              {paidThisMonth > 0 && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-100">
                  <TrendingUp className="h-4 w-4" />
                  נגבו החודש ₪{paidThisMonth.toFixed(0)}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                        {showTherapistMarker && client.therapistName && (
                          <div className="flex items-center gap-1.5 -mt-2 mb-3">
                            <span
                              className="inline-block h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: getTherapistAccent(client.therapistId) }}
                            />
                            <span className="text-sm font-semibold text-foreground truncate">
                              {client.therapistName}
                            </span>
                          </div>
                        )}
                        
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

                        {/* דחיית התראה ("אל תזכיר לי") — לחוב בלבד. עוצר
                            propagation כדי לא לפתוח את פירוט המטופל בלחיצה. */}
                        {client.totalDebt > 0 && (
                          <div
                            className="mt-3 pt-3 border-t border-rose-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isSnoozed(client) ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  נדחה עד {format(new Date(client.snoozeUntil as string | Date), "dd/MM")}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  disabled={snoozeBusy === client.id}
                                  onClick={() => handleUnsnooze(client.id)}
                                >
                                  בטל דחייה
                                </Button>
                              </div>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    disabled={snoozeBusy === client.id}
                                  >
                                    <BellOff className="h-3.5 w-3.5 ml-1" />
                                    אל תזכיר לי
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>דחיית התראת החוב</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => snoozePreset(client.id, 7)}>
                                    לשבוע
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => snoozePreset(client.id, 30)}>
                                    לחודש
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSnoozeCustomDate(undefined);
                                      setSnoozeDateClient(client);
                                    }}
                                  >
                                    עד תאריך...
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* דיאלוג: דחיית התראת חוב עד תאריך נבחר */}
            <Dialog
              open={!!snoozeDateClient}
              onOpenChange={(o) => !o && setSnoozeDateClient(null)}
            >
              <DialogContent className="max-w-fit">
                <DialogHeader>
                  <DialogTitle>דחיית התראת החוב עד תאריך</DialogTitle>
                </DialogHeader>
                <Calendar
                  mode="single"
                  selected={snoozeCustomDate}
                  onSelect={setSnoozeCustomDate}
                  disabled={(date) => date <= new Date()}
                  locale={he}
                />
                <Button
                  disabled={!snoozeCustomDate || !snoozeDateClient}
                  onClick={() => {
                    if (snoozeCustomDate && snoozeDateClient) {
                      void handleSnooze(snoozeDateClient.id, snoozeCustomDate);
                      setSnoozeDateClient(null);
                    }
                  }}
                >
                  {snoozeCustomDate
                    ? `דחה עד ${format(snoozeCustomDate, "dd/MM/yyyy")}`
                    : "בחר/י תאריך"}
                </Button>
              </DialogContent>
            </Dialog>
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
                    {/* ייצוא מפורט */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="gap-1.5 bg-white/80 hover:bg-white border-emerald-200 text-emerald-700 hover:text-emerald-800"
                        >
                          <Download className="h-3.5 w-3.5" />
                          ייצוא מפורט
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>ייצוא מפורט</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={async () => {
                          const exportData: PaymentExportData[] = paidPayments.map(p => ({
                            id: p.id,
                            clientName: p.clientName,
                            amount: p.amount,
                            expectedAmount: p.expectedAmount,
                            method: p.method,
                            status: p.status,
                            paidAt: p.paidAt,
                            createdAt: p.createdAt,
                            sessionDate: p.session?.startTime || null,
                            sessionType: p.session?.type || null,
                            receiptNumber: null,
                            hasReceipt: false,
                          }));
                          try {
                            await exportDetailedExcel(exportData, "דוח תשלומים מפורט");
                            toast.success("הקובץ הורד בהצלחה");
                          } catch {
                            toast.error("שגיאה בייצוא הקובץ");
                          }
                        }}>
                          Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          const exportData: PaymentExportData[] = paidPayments.map(p => ({
                            id: p.id,
                            clientName: p.clientName,
                            amount: p.amount,
                            expectedAmount: p.expectedAmount,
                            method: p.method,
                            status: p.status,
                            paidAt: p.paidAt,
                            createdAt: p.createdAt,
                            sessionDate: p.session?.startTime || null,
                            sessionType: p.session?.type || null,
                            receiptNumber: null,
                            hasReceipt: false,
                          }));
                          exportDetailedPDF(exportData, "דוח תשלומים מפורט");
                          toast.success("הקובץ הורד בהצלחה");
                        }}>
                          PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <SelectTrigger className="w-full sm:w-[200px] bg-white shadow-sm">
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
              
              // סינון חודש מתבצע server-side (ראה useEffect על selectedMonth).
              // לא צריך filter בזיכרון כאן — paidPayments כבר מוגבל לחודש הנבחר.

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
                          {showTherapistMarker && payment.therapistName && (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="inline-block h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: getTherapistAccent(payment.therapistId) }}
                              />
                              <span className="text-sm font-semibold text-foreground truncate">
                                {payment.therapistName}
                              </span>
                            </span>
                          )}
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
                  
                  {/* טען עוד */}
                  {hasMoreHistory && (
                    <div className="text-center mt-4">
                      <Button
                        variant="outline"
                        onClick={loadMoreHistory}
                        disabled={isLoadingMore}
                      >
                        {isLoadingMore ? (
                          <><Loader2 className="h-4 w-4 animate-spin ml-2" />טוען...</>
                        ) : (
                          "טען תשלומים נוספים"
                        )}
                      </Button>
                    </div>
                  )}

                  {/* סיכום */}
                  <div className="text-sm text-muted-foreground text-center mt-4 py-3 bg-gradient-to-r from-transparent via-slate-100 to-transparent rounded-full">
                    מציג {filteredHistory.length} מתוך {paidPayments.length} תשלומים{hasMoreHistory ? " (יש עוד)" : ""}
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
        {selectedClient.unpaidSessionsCount > 1 && selectedClient.totalDebt > 0 && (
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
                    className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] h-full"
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
            onCardcomRequested={(p) => {
              // Lift Cardcom dialog לרמת העמוד — אם נשאיר אותו בתוך QuickMarkPaid
              // הוא יעלם ברגע ש-onOpenChange(false) רץ ו-selectedPaymentSession=null
              // יסיר את QuickMarkPaid מה-DOM. תיעוד ההסבר ב-quick-mark-paid.tsx
              // ואותו דפוס כמו בעמוד היומן.
              setCardcomData({
                paymentId: p.paymentId,
                sessionId: p.sessionId,
                clientId: p.clientId,
                clientName: p.clientName ?? "מטופל",
                clientPhone: p.clientPhone,
                clientEmail: p.clientEmail,
                amount: p.amount,
              });
              setCardcomOpen(true);
            }}
          />
        )}

        {/* Cardcom dialog ברמת העמוד — חי בלי תלות ב-QuickMarkPaid.
            ⚠️ אין לאפס cardcomData ב-onClose! הקבלה נפתחת 220ms אחרי
            שהדיאלוג הראשי נסגר; אם ננתק את הנתונים בסגירה, ה-component
            ייעלם וה-ReceiptPreviewDialog (שיושב בתוכו) לא יראה.
            המידע מתאפס ב-onPaymentSuccess אחרי שהקבלה נסגרה. */}
        {cardcomData && (
          <ChargeCardcomDialog
            open={cardcomOpen}
            onOpenChange={(open) => {
              setCardcomOpen(open);
            }}
            paymentId={cardcomData.paymentId}
            sessionId={cardcomData.sessionId}
            clientId={cardcomData.clientId}
            clientName={cardcomData.clientName}
            clientPhone={cardcomData.clientPhone}
            clientEmail={cardcomData.clientEmail}
            amount={cardcomData.amount}
            onPaymentSuccess={async () => {
              fetchData();
              // עכשיו אפשר לאפס — הקבלה נסגרה.
              setCardcomData(null);
            }}
          />
        )}
      </div>
    );
  }

  return null;
}
