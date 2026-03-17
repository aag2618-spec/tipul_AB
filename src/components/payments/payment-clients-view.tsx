"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2, AlertCircle, CheckCircle, Search, Calendar as CalendarIcon,
  CreditCard, Clock, Wallet, History, Mail, Download, TrendingUp,
} from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { PaymentHistoryItem } from "@/components/payments/payment-history-item";
import { toast } from "sonner";
import {
  exportDetailedExcel, exportDetailedPDF, type PaymentExportData,
} from "@/lib/export-utils";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

type ClientFilterMode = "all" | "specific";
type DateFilterMode = "all" | "specific";
type HistoryViewMode = "debts" | "history";

interface PaymentClientsViewProps {
  filteredClients: ClientDebt[];
  clientFilterMode: ClientFilterMode;
  setClientFilterMode: (mode: ClientFilterMode) => void;
  dateFilterMode: DateFilterMode;
  setDateFilterMode: (mode: DateFilterMode) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  historyViewMode: HistoryViewMode;
  setHistoryViewMode: (mode: HistoryViewMode) => void;
  paidPayments: PaidPayment[];
  chartData: { month: string; total: number }[];
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  monthOptions: { value: string; label: string }[];
  isSendingAllEmails: boolean;
  sendDebtReminderToAll: () => Promise<void>;
  onSelectClient: (client: ClientDebt) => void;
  breadcrumbs: React.ReactNode;
}

export function PaymentClientsView({
  filteredClients,
  clientFilterMode,
  setClientFilterMode,
  dateFilterMode,
  setDateFilterMode,
  searchTerm,
  setSearchTerm,
  selectedDate,
  setSelectedDate,
  historyViewMode,
  setHistoryViewMode,
  paidPayments,
  chartData,
  selectedMonth,
  setSelectedMonth,
  monthOptions,
  isSendingAllEmails,
  sendDebtReminderToAll,
  onSelectClient,
  breadcrumbs,
}: PaymentClientsViewProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      {breadcrumbs}

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
                const sessionsCount = dateFilterMode === "specific" && selectedDate
                  ? client.unpaidSessions.length
                  : client.unpaidSessionsCount;

                return (
                  <Card
                    key={client.id}
                    className="cursor-pointer bg-gradient-to-br from-rose-50/80 to-orange-50/50 border-rose-100 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 rounded-xl"
                    onClick={() => onSelectClient(client)}
                  >
                    <CardContent className="p-4">
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
          {/* גרף קו */}
          <Card className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border-emerald-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-emerald-900">מגמת תשלומים - 6 חודשים אחרונים</h3>
                </div>
                <div className="flex gap-2">
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
                        exportDetailedExcel(exportData, "דוח תשלומים מפורט");
                        toast.success("הקובץ הורד בהצלחה");
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
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} tickFormatter={(value) => `₪${value}`} />
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
            let filteredHistory = paidPayments;

            if (searchTerm && clientFilterMode === "specific") {
              const search = searchTerm.toLowerCase();
              filteredHistory = filteredHistory.filter(p =>
                p.clientName.toLowerCase().includes(search)
              );
            }

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
                      <div className="flex items-center gap-2 px-1">
                        <Badge variant="outline" className="font-medium">
                          {payment.clientName}
                        </Badge>
                      </div>
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
