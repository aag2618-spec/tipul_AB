import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, CreditCard, CheckCircle } from "lucide-react";
import Link from "next/link";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { AddCreditDialog } from "@/components/clients/add-credit-dialog";
import { SendReminderButton } from "@/components/clients/send-reminder-button";
import { SendPaymentHistoryButton } from "@/components/clients/send-payment-history-button";
import { PaymentHistoryGrid } from "@/components/payments/payment-history-grid";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { calculateSessionDebt } from "@/lib/payment-utils";

interface ChildPayment {
  id: string;
  amount: unknown;
  paidAt: Date | string | null;
  method?: string;
  createdAt: Date;
}

interface SessionPayment {
  id: string;
  status: string;
  amount: unknown;
  expectedAmount: unknown;
  paidAt?: Date | string | null;
  childPayments?: ChildPayment[];
}

interface TherapySession {
  id: string;
  startTime: Date;
  endTime: Date;
  type: string;
  status: string;
  price: unknown;
  sessionNote: { content?: string } | null;
  cancellationReason: string | null;
  payment: SessionPayment | null;
}

interface Payment {
  id: string;
  amount: unknown;
  expectedAmount: unknown;
  method: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  session: any | null;
  childPayments?: ChildPayment[];
}

interface ClientPaymentsTabProps {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  creditBalance: number;
  totalDebt: number;
  unpaidSessions: TherapySession[];
  payments: Payment[];
}

export function ClientPaymentsTab({
  clientId,
  clientName,
  clientEmail,
  creditBalance,
  totalDebt,
  unpaidSessions,
  payments,
}: ClientPaymentsTabProps) {
  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList className="bg-muted/40 p-1 h-auto">
        <TabsTrigger value="pending" className="gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
          חובות פתוחים
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
          היסטוריית תשלומים
        </TabsTrigger>
      </TabsList>

      {/* Pending Payments */}
      <TabsContent value="pending" className="mt-4">
        <div className="space-y-4">
          {/* Summary bar with actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              {totalDebt > 0 && (
                <p className="text-sm text-muted-foreground">
                  {unpaidSessions.length} פגישות • סה&quot;כ חוב: <span className="font-bold text-red-600">₪{totalDebt}</span>
                </p>
              )}
              {creditBalance > 0 && (
                <p className="text-sm text-muted-foreground">
                  קרדיט: <span className="font-bold text-emerald-600">₪{creditBalance}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <AddCreditDialog
                clientId={clientId}
                clientName={clientName}
                currentCredit={creditBalance}
              />
              {totalDebt > 0 && (
                <>
                  <SendReminderButton
                    clientId={clientId}
                    clientName={clientName}
                    size="default"
                  />
                  <Button asChild className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                    <Link href={`/dashboard/payments/pay/${clientId}`}>
                      <CreditCard className="h-4 w-4" />
                      שלם הכל
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          {unpaidSessions.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {unpaidSessions.map((session) => {
                const debt = calculateSessionDebt(session);
                const alreadyPaid = session.payment ? Number(session.payment.amount) : 0;

                const cardContent = (
                  <Card className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] h-full">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {format(new Date(session.startTime), "dd/MM/yyyy", { locale: he })}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">חוב:</span>
                          <span className="font-bold text-red-600">₪{debt}</span>
                        </div>
                        {alreadyPaid > 0 && session.payment && (
                          <>
                            {session.payment.childPayments && session.payment.childPayments.length > 0 ? (
                              session.payment.childPayments.map((child: ChildPayment, idx: number) => {
                                const childAmount = Number(child.amount);
                                return (
                                  <div key={child.id} className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">תשלום {idx + 1}:</span>
                                    <span>
                                      <span className="text-emerald-600">₪{childAmount}</span>
                                      {child.paidAt && (
                                        <span className="text-muted-foreground mr-1">
                                          · {format(new Date(child.paidAt), "dd/MM/yyyy")}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">שולם חלקית:</span>
                                <span>
                                  <span className="text-emerald-600">₪{alreadyPaid}</span>
                                  {(session.payment as any).paidAt && (
                                    <span className="text-muted-foreground mr-1">
                                      · {format(new Date((session.payment as any).paidAt), "dd/MM/yyyy")}
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="mt-3 pt-2 border-t text-xs text-primary flex items-center gap-1">
                        לחץ לתשלום
                      </div>
                    </CardContent>
                  </Card>
                );

                return session.payment ? (
                  <QuickMarkPaid
                    key={session.id}
                    sessionId={session.id}
                    clientId={clientId}
                    clientName={clientName}
                    amount={debt}
                    creditBalance={creditBalance}
                    existingPayment={{
                      id: session.payment.id,
                      status: session.payment.status,
                    }}
                    totalClientDebt={totalDebt}
                    unpaidSessionsCount={unpaidSessions.length}
                  >
                    {cardContent}
                  </QuickMarkPaid>
                ) : (
                  <Link key={session.id} href={`/dashboard/payments/pay/${clientId}`}>
                    {cardContent}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-7 w-7 text-green-400" />
              </div>
              <p className="font-medium mb-1">כל התשלומים שולמו!</p>
              <p className="text-sm text-muted-foreground">אין חובות פתוחים למטופל זה</p>
            </div>
          )}
        </div>
      </TabsContent>

      {/* Payment History */}
      <TabsContent value="history" className="mt-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">היסטוריית תשלומים</h3>
              <p className="text-sm text-muted-foreground">תשלומים שהושלמו במלואם</p>
            </div>
            <div className="flex items-center gap-2">
              <SendPaymentHistoryButton
                clientId={clientId}
                clientEmail={clientEmail}
                hasPayments={payments.filter(p => p.status === "PAID").length > 0}
              />
              <AddCreditDialog
                clientId={clientId}
                clientName={clientName}
                currentCredit={creditBalance}
              />
            </div>
          </div>

          <PaymentHistoryGrid
            payments={payments.map((payment) => ({
              ...payment,
              amount: Number(payment.amount),
              expectedAmount: payment.expectedAmount ? Number(payment.expectedAmount) : null,
              createdAt: payment.createdAt,
              paidAt: payment.paidAt,
              session: payment.session,
              childPayments: payment.childPayments?.map((child) => ({
                id: child.id,
                amount: Number(child.amount),
                method: child.method || payment.method,
                paidAt: child.paidAt ? new Date(child.paidAt) : null,
                createdAt: child.createdAt,
              })),
            }))}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
