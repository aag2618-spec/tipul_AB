import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Repeat, Clock, Edit } from "lucide-react";
import Link from "next/link";
import { TodaySessionCard } from "@/components/dashboard/today-session-card";
import { SessionHistoryGrid } from "@/components/clients/session-history-grid";

interface RecurringPattern {
  id: string;
  dayOfWeek: number;
  time: string;
  duration: number;
  isActive: boolean;
}

interface SessionPayment {
  id: string;
  status: string;
  amount: unknown;
  expectedAmount: unknown;
  paidAt?: Date | string | null;
  childPayments?: Array<{ id: string; amount: unknown; paidAt: Date | string | null }>;
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

interface ClientSessionsTabProps {
  clientId: string;
  clientName: string;
  creditBalance: number;
  totalDebt: number;
  unpaidSessionsCount: number;
  recurringPatterns: RecurringPattern[];
  therapySessions: TherapySession[];
  sessionCount: number;
}

export function ClientSessionsTab({
  clientId,
  clientName,
  creditBalance,
  totalDebt,
  unpaidSessionsCount,
  recurringPatterns,
  therapySessions,
  sessionCount,
}: ClientSessionsTabProps) {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  return (
    <>
      {/* Recurring Pattern Card */}
      {recurringPatterns && recurringPatterns.length > 0 && (
        <Card className="mb-4 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">מפגש קבוע</CardTitle>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/calendar?client=${clientId}`}>
                  <Edit className="h-3 w-3 ml-1" />
                  ערוך
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recurringPatterns.map((pattern) => (
              <div key={pattern.id} className="flex items-center gap-3 p-3 rounded-lg bg-background">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">כל יום {days[pattern.dayOfWeek]}</p>
                  <p className="text-sm text-muted-foreground">
                    שעה {pattern.time} • {pattern.duration} דקות
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Repeat className="h-3 w-3" />
                  פעיל
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>פגישות</CardTitle>
          <CardDescription>
            {sessionCount} פגישות בסך הכל
          </CardDescription>
        </CardHeader>
        <CardContent>
          {therapySessions.length > 0 ? (
            <Tabs defaultValue="past" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="past">
                  היסטוריית פגישות ({therapySessions.filter(s => new Date(s.startTime) < new Date()).length})
                </TabsTrigger>
                <TabsTrigger value="upcoming">
                  פגישות עתידיות ({therapySessions.filter(s => new Date(s.startTime) >= new Date()).length})
                </TabsTrigger>
              </TabsList>

              {/* היסטוריית פגישות */}
              <TabsContent value="past">
                {therapySessions.filter(s => new Date(s.startTime) < new Date()).length > 0 ? (
                  <SessionHistoryGrid
                    sessions={therapySessions
                      .filter(s => new Date(s.startTime) < new Date())
                      .map((session) => ({
                        id: session.id,
                        startTime: session.startTime.toISOString(),
                        endTime: session.endTime.toISOString(),
                        type: session.type as string,
                        status: session.status as string,
                        price: Number(session.price),
                        sessionNote: session.sessionNote?.content || null,
                        cancellationReason: session.cancellationReason,
                        payment: session.payment ? {
                          id: session.payment.id,
                          status: session.payment.status as string,
                          amount: Number(session.payment.amount),
                          expectedAmount: Number(session.payment.expectedAmount),
                        } : null,
                        client: {
                          id: clientId,
                          name: clientName,
                          creditBalance,
                          totalDebt,
                          unpaidSessionsCount,
                        },
                      }))}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                    <p>אין פגישות קודמות</p>
                  </div>
                )}
              </TabsContent>

              {/* פגישות עתידיות */}
              <TabsContent value="upcoming">
                {therapySessions.filter(s => new Date(s.startTime) >= new Date()).length > 0 ? (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {therapySessions
                      .filter(s => new Date(s.startTime) >= new Date())
                      .map((session) => (
                        <TodaySessionCard
                          key={session.id}
                          context="patient-file"
                          session={{
                            id: session.id,
                            startTime: session.startTime,
                            endTime: session.endTime,
                            type: session.type as string,
                            status: session.status as string,
                            price: Number(session.price),
                            sessionNote: session.sessionNote?.content || null,
                            cancellationReason: session.cancellationReason,
                            payment: session.payment ? {
                              id: session.payment.id,
                              status: session.payment.status as string,
                              amount: Number(session.payment.amount),
                              expectedAmount: Number(session.payment.expectedAmount),
                            } : null,
                            client: {
                              id: clientId,
                              name: clientName,
                              creditBalance,
                              totalDebt,
                              unpaidSessionsCount,
                            },
                          }}
                        />
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                    <p>אין פגישות עתידיות מתוכננות</p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href={`/dashboard/calendar?client=${clientId}`}>
                        קבע פגישה חדשה
                      </Link>
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
              <p>אין פגישות עדיין</p>
              <Button variant="link" asChild className="mt-2">
                <Link href={`/dashboard/calendar?client=${clientId}`}>
                  קבע פגישה ראשונה
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
