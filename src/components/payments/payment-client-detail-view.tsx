"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, AlertCircle, CheckCircle, Calendar as CalendarIcon,
  CreditCard, Wallet, History, Mail,
} from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { PaymentHistoryItem } from "@/components/payments/payment-history-item";
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

type HistoryViewMode = "debts" | "history";

interface PaymentClientDetailViewProps {
  selectedClient: ClientDebt;
  paidPayments: PaidPayment[];
  historyViewMode: HistoryViewMode;
  setHistoryViewMode: (mode: HistoryViewMode) => void;
  isSendingEmail: boolean;
  sendDebtReminder: (clientId: string, clientName: string) => Promise<void>;
  selectedPaymentSession: UnpaidSession | null;
  setSelectedPaymentSession: (session: UnpaidSession | null) => void;
  isPaymentDialogOpen: boolean;
  setIsPaymentDialogOpen: (open: boolean) => void;
  fetchData: () => Promise<void>;
  breadcrumbs: React.ReactNode;
}

export function PaymentClientDetailView({
  selectedClient,
  paidPayments,
  historyViewMode,
  setHistoryViewMode,
  isSendingEmail,
  sendDebtReminder,
  selectedPaymentSession,
  setSelectedPaymentSession,
  isPaymentDialogOpen,
  setIsPaymentDialogOpen,
  fetchData,
  breadcrumbs,
}: PaymentClientDetailViewProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      {breadcrumbs}

      {/* כותרת עם כפתורי פעולה */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{selectedClient.fullName}</h1>
          <p className="text-muted-foreground">פירוט תשלומים</p>
        </div>
        <div className="flex gap-2">
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

      {/* תשלום מהיר */}
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

      {/* דיאלוג תשלום מהיר */}
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
              fetchData();
            }
          }}
          hideButton={true}
        />
      )}
    </div>
  );
}
