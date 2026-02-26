'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Calendar, Clock, CheckCircle } from 'lucide-react';

interface ChildPayment {
  id: string;
  amount: number | { toNumber: () => number };
  method: string;
  paidAt: Date | string | null;
}

interface Payment {
  id: string;
  amount: number | { toNumber: () => number };
  expectedAmount: number | { toNumber: () => number } | null;
  method: string;
  status: string;
  createdAt: Date | string;
  paidAt: Date | string | null;
  session?: {
    id: string;
    startTime: Date | string;
    type: string;
  } | null;
  childPayments?: ChildPayment[];
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

  const childPayments = payment.childPayments || [];
  const hasMultiplePayments = childPayments.length > 0;
  const totalPaid = amount;

  const isPartial = totalPaid < expectedAmount;
  const remaining = expectedAmount - totalPaid;
  const isCompleted = payment.status === 'PAID' && !isPartial;
  const paymentCount = hasMultiplePayments ? childPayments.length : 1;

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

  const getPaymentDate = (payment: Payment | ChildPayment) => {
    const date = 'paidAt' in payment && payment.paidAt 
      ? payment.paidAt 
      : 'createdAt' in payment 
        ? payment.createdAt 
        : new Date();
    return date ? new Date(date) : new Date();
  };

  const getPercentage = (amt: number) => {
    return Math.round((amt / expectedAmount) * 100);
  };

  // Get last payment date for completion display
  const lastPaymentDate = hasMultiplePayments && childPayments.length > 0
    ? getPaymentDate(childPayments[childPayments.length - 1])
    : getPaymentDate(payment);

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Payment Amount & Status */}
            <div className="flex items-center gap-2 mb-2">
              {isCompleted && <span className="text-green-600 font-bold">✓</span>}
              {isPartial && <span className="text-yellow-600 font-bold">🟡</span>}
              
              {isCompleted ? (
                <span className="font-semibold text-lg">₪{expectedAmount}</span>
              ) : (
                <span className="font-semibold text-lg">₪{totalPaid}</span>
              )}
              
              {isPartial && (
                <span className="text-sm text-muted-foreground">
                  (₪{totalPaid}/₪{expectedAmount})
                </span>
              )}
              
              {hasMultiplePayments && (
                <>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">
                    {paymentCount} תשלומים
                  </span>
                </>
              )}
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
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  שולם במלואו
                </span>
              )}
              {isPartial && (
                <span className="text-yellow-600">
                  💰 בתהליך תשלום
                </span>
              )}
              <span className="text-muted-foreground">
                {isCompleted && hasMultiplePayments ? (
                  <>הושלם ב-{format(lastPaymentDate, 'd/M/yyyy')}</>
                ) : (
                  <>ב-{format(getPaymentDate(payment), 'd/M/yyyy HH:mm')}</>
                )}
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
                  פרטים מלאים
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Expanded Details */}
        {showDetails && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {/* Session Details */}
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

            {/* Payment Timeline */}
            {hasMultiplePayments ? (
              <div className="bg-sky-50 border border-sky-200 rounded p-3">
                <p className="text-sm font-medium text-sky-800 mb-3 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  פירוט תשלומים ({paymentCount} תשלומים)
                </p>
                <div className="space-y-2">
                  {childPayments.map((child, index) => {
                    const childAmount = typeof child.amount === 'number' 
                      ? child.amount 
                      : child.amount.toNumber();
                    const isLast = index === childPayments.length - 1;
                    
                    return (
                      <div key={child.id} className="flex items-center justify-between text-sm bg-white rounded p-2">
                        <div className="flex items-center gap-2">
                          <span className={`${isLast && isCompleted ? 'bg-green-50 text-green-900 border border-green-200' : 'bg-yellow-50 text-yellow-900 border border-yellow-200'} font-semibold px-2 py-0.5 rounded text-xs`}>
                            #{index + 1}
                          </span>
                          <span className={isLast && isCompleted ? 'text-green-700' : 'text-yellow-700'}>
                            {format(getPaymentDate(child), 'dd/MM/yyyy')}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="font-semibold">₪{childAmount}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {getMethodText(child.method)}
                          </span>
                          {isLast && isCompleted && (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                הושלם
                              </span>
                            </>
                          )}
                        </div>
                        <span className={`text-xs font-medium ${isLast && isCompleted ? 'text-green-600' : 'text-sky-600'}`}>
                          {getPercentage(childAmount)}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div className="mt-3 pt-3 border-t border-sky-200 flex items-center justify-between text-sm">
                  <span className="font-semibold text-sky-800">סה&quot;כ:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sky-900">₪{totalPaid}</span>
                    {isPartial && (
                      <span className="text-yellow-600 text-xs">
                        (נותר: ₪{remaining})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : isPartial ? (
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
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
