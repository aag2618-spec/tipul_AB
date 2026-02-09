'use client';

import { useState } from 'react';
import { format } from 'date-fns';
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
import { CreditCard, Calendar as CalendarIcon, X } from 'lucide-react';
import { PaymentHistoryItem } from './payment-history-item';

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

  // סינון לפי תאריך אם נבחר
  const filteredPayments = selectedDate
    ? fullyPaidPayments.filter((payment) => {
        const paymentDate = payment.paidAt ? new Date(payment.paidAt) : new Date(payment.createdAt);
        return (
          paymentDate.getDate() === selectedDate.getDate() &&
          paymentDate.getMonth() === selectedDate.getMonth() &&
          paymentDate.getFullYear() === selectedDate.getFullYear()
        );
      })
    : fullyPaidPayments;

  const clearDateFilter = () => {
    setSelectedDate(undefined);
  };

  if (fullyPaidPayments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CreditCard className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <p className="text-lg font-medium">אין תשלומים שהושלמו</p>
          <p className="text-sm text-muted-foreground">תשלומים שיושלמו במלואם יופיעו כאן</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* אפשרות סינון לפי תאריך */}
      <div className="flex items-center gap-2">
        <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "סנן לפי תאריך"}
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

        {selectedDate && (
          <Button variant="ghost" size="sm" onClick={clearDateFilter} className="gap-1">
            <X className="h-4 w-4" />
            נקה סינון
          </Button>
        )}

        {selectedDate && (
          <span className="text-sm text-muted-foreground">
            מציג תשלומים מתאריך {format(selectedDate, "dd/MM/yyyy")}
          </span>
        )}
      </div>

      {/* רשימת תשלומים */}
      {filteredPayments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
            <p className="text-lg font-medium">אין תשלומים בתאריך זה</p>
            <Button variant="link" onClick={clearDateFilter}>
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
      <div className="text-sm text-muted-foreground text-center">
        {selectedDate 
          ? `מציג ${filteredPayments.length} מתוך ${fullyPaidPayments.length} תשלומים`
          : `סה"כ ${fullyPaidPayments.length} תשלומים שהושלמו`
        }
      </div>
    </div>
  );
}
