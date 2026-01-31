'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Calendar, Clock } from 'lucide-react';

interface Payment {
  id: string;
  amount: number | { toNumber: () => number };
  expectedAmount: number | { toNumber: () => number } | null;
  method: string;
  status: string;
  createdAt: Date | string;
  session?: {
    id: string;
    startTime: Date | string;
    type: string;
  } | null;
}

interface PaymentHistoryItemProps {
  payment: Payment;
}

export function PaymentHistoryItem({ payment }: PaymentHistoryItemProps) {
  const [showDetails, setShowDetails] = useState(false);

  const amount = typeof payment.amount === 'number' 
    ? payment.amount 
    : payment.amount.toNumber();
  
  const expectedAmount = payment.expectedAmount 
    ? (typeof payment.expectedAmount === 'number' 
        ? payment.expectedAmount 
        : payment.expectedAmount.toNumber())
    : amount;

  const isPartial = amount < expectedAmount;
  const remaining = expectedAmount - amount;
  const isCompleted = payment.status === 'PAID' && !isPartial;

  const getMethodText = (method: string) => {
    switch (method) {
      case 'CASH': return 'מזומן';
      case 'CREDIT_CARD': return 'כרטיס אשראי';
      case 'BANK_TRANSFER': return 'העברה בנקאית';
      case 'CREDIT': return 'קרדיט';
      case 'CHECK': return 'המחאה';
      default: return 'אחר';
    }
  };

  const getSessionTypeText = (type: string) => {
    switch (type) {
      case 'ONLINE': return 'אונליין';
      case 'PHONE': return 'טלפון';
      case 'IN_PERSON': return 'פרונטלי';
      default: return type;
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Payment Amount & Status */}
            <div className="flex items-center gap-2 mb-2">
              {isCompleted && <span className="text-green-600 font-bold">✓</span>}
              {isPartial && <span className="text-yellow-600 font-bold">🟡</span>}
              <span className="font-semibold text-lg">₪{amount}</span>
              {isPartial && (
                <span className="text-sm text-muted-foreground">
                  (₪{amount}/₪{expectedAmount})
                </span>
              )}
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">
                {getMethodText(payment.method)}
              </span>
            </div>

            {/* Session Info */}
            {payment.session && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  פגישה: {format(new Date(payment.session.startTime), 'd/M/yyyy', { locale: he })}
                </span>
                <span>
                  {format(new Date(payment.session.startTime), 'HH:mm')}
                </span>
                <Badge variant="outline" className="text-xs">
                  {getSessionTypeText(payment.session.type)}
                </Badge>
              </div>
            )}

            {/* Payment Date & Status */}
            <div className="flex items-center gap-2 text-sm">
              {isCompleted && (
                <span className="text-green-600">✓ שולם במלואו</span>
              )}
              {isPartial && (
                <span className="text-yellow-600">
                  💰 ₪{amount} שולם | ₪{remaining} נותר
                </span>
              )}
              <span className="text-muted-foreground">
                ב-{format(new Date(payment.createdAt), 'd/M/yyyy HH:mm')}
              </span>
            </div>
          </div>

          {/* Status Badge & Details Button */}
          <div className="flex flex-col items-end gap-2">
            <Badge
              variant={
                payment.status === 'PAID'
                  ? 'default'
                  : payment.status === 'PENDING'
                  ? 'secondary'
                  : 'destructive'
              }
            >
              {payment.status === 'PAID'
                ? 'שולם'
                : payment.status === 'PENDING'
                ? 'ממתין'
                : payment.status === 'CANCELLED'
                ? 'בוטל'
                : 'הוחזר'}
            </Badge>

            {(payment.session || isPartial) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="h-7 text-xs"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="h-3 w-3 ml-1" />
                    סגור
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 ml-1" />
                    פרטים
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Expanded Details */}
        {showDetails && (
          <div className="mt-4 pt-4 border-t space-y-2">
            {payment.session && (
              <div className="bg-muted/50 rounded p-3 space-y-1">
                <p className="text-sm font-medium">פרטי הפגישה:</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {format(new Date(payment.session.startTime), 'EEEE, d בMMMM yyyy', { locale: he })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    שעה {format(new Date(payment.session.startTime), 'HH:mm')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>סוג: {getSessionTypeText(payment.session.type)}</span>
                </div>
              </div>
            )}

            {isPartial && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm font-medium text-yellow-800 mb-1">
                  תשלום חלקי
                </p>
                <div className="text-sm text-yellow-700 space-y-1">
                  <div>סכום מלא: ₪{expectedAmount}</div>
                  <div>שולם: ₪{amount}</div>
                  <div className="font-semibold">נותר: ₪{remaining}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
