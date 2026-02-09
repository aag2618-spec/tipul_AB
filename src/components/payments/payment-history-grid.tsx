'use client';

import { useState, useMemo } from 'react';
import { format, subMonths } from 'date-fns';
import { he } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  CreditCard, 
  Calendar as CalendarIcon, 
  X, 
  Download,
  TrendingUp
} from 'lucide-react';
import { PaymentHistoryItem } from './payment-history-item';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ChildPayment {
  id: string;
  amount: number;
  method: string;
  paidAt: Date | null;
  createdAt: Date;
}

interface Payment {
  id: string;
  amount: number;
  expectedAmount: number | null;
  method: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  session?: {
    id: string;
    startTime: Date;
    type: string;
  } | null;
  childPayments?: ChildPayment[];
}

interface PaymentHistoryGridProps {
  payments: Payment[];
}

export function PaymentHistoryGrid({ payments }: PaymentHistoryGridProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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

  // סינון רק תשלומים שהושלמו במלואם
  const fullyPaidPayments = payments.filter((payment) => {
    if (payment.status !== "PAID") return false;
    
    const amount = payment.amount;
    const expectedAmount = payment.expectedAmount || amount;
    const childPaymentsTotal = payment.childPayments?.reduce(
      (sum, child) => sum + child.amount, 0
    ) || 0;
    const totalPaid = amount + childPaymentsTotal;
    
    return totalPaid >= expectedAmount;
  });

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
    fullyPaidPayments.forEach((payment) => {
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
  }, [fullyPaidPayments]);

  // סינון לפי תאריך וחודש
  const filteredPayments = useMemo(() => {
    let filtered = fullyPaidPayments;
    
    // סינון לפי תאריך ספציפי
    if (selectedDate) {
      filtered = filtered.filter((payment) => {
        const paymentDate = payment.paidAt ? new Date(payment.paidAt) : new Date(payment.createdAt);
        return (
          paymentDate.getDate() === selectedDate.getDate() &&
          paymentDate.getMonth() === selectedDate.getMonth() &&
          paymentDate.getFullYear() === selectedDate.getFullYear()
        );
      });
    }
    
    // סינון לפי חודש
    if (selectedMonth !== "all") {
      filtered = filtered.filter((payment) => {
        const paymentDate = payment.paidAt ? new Date(payment.paidAt) : new Date(payment.createdAt);
        const paymentMonth = format(paymentDate, "yyyy-MM");
        return paymentMonth === selectedMonth;
      });
    }
    
    return filtered;
  }, [fullyPaidPayments, selectedDate, selectedMonth]);

  const clearDateFilter = () => {
    setSelectedDate(undefined);
  };

  const clearAllFilters = () => {
    setSelectedDate(undefined);
    setSelectedMonth("all");
  };

  if (fullyPaidPayments.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-slate-50 to-gray-50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CreditCard className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <p className="text-lg font-medium">אין תשלומים שהושלמו</p>
          <p className="text-sm text-muted-foreground">תשלומים שיושלמו במלואם יופיעו כאן</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
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
                  formatter={(value: number) => [`₪${value}`, "סה״כ"]}
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

      {/* סינון */}
      <div className="flex flex-wrap items-center gap-3">
        {/* סינון לפי תאריך */}
        <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2 bg-white shadow-sm">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "תאריך ספציפי"}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-auto p-4">
            <DialogHeader>
              <DialogTitle>בחר תאריך</DialogTitle>
            </DialogHeader>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                setIsCalendarOpen(false);
              }}
              locale={he}
            />
          </DialogContent>
        </Dialog>

        {/* סינון לפי חודש */}
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

        {(selectedDate || selectedMonth !== "all") && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
            נקה סינון
          </Button>
        )}
      </div>

      {/* רשימת תשלומים */}
      {filteredPayments.length === 0 ? (
        <Card className="bg-gradient-to-br from-slate-50 to-gray-50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
            <p className="text-lg font-medium">אין תשלומים לפי הסינון</p>
            <Button variant="link" onClick={clearAllFilters}>
              הצג את כל התשלומים
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPayments.map((payment) => (
            <PaymentHistoryItem
              key={payment.id}
              payment={{
                ...payment,
                amount: payment.amount,
                expectedAmount: payment.expectedAmount,
                createdAt: payment.createdAt,
                session: payment.session,
                childPayments: payment.childPayments?.map((child) => ({
                  ...child,
                  amount: child.amount,
                  paidAt: child.paidAt || child.createdAt,
                })),
              }}
            />
          ))}
        </div>
      )}

      {/* סיכום */}
      <div className="text-sm text-muted-foreground text-center py-3 bg-gradient-to-r from-transparent via-slate-100 to-transparent rounded-full">
        {selectedDate || selectedMonth !== "all"
          ? `מציג ${filteredPayments.length} מתוך ${fullyPaidPayments.length} תשלומים`
          : `סה"כ ${fullyPaidPayments.length} תשלומים שהושלמו`
        }
      </div>
    </div>
  );
}
