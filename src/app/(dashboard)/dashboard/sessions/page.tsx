import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Calendar, CheckCircle, AlertCircle, User, MoreVertical, Eye } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CompleteSessionDialog } from "@/components/sessions/complete-session-dialog";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

async function getSessions(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.therapySession.findMany({
    where: { therapistId: userId },
    orderBy: { startTime: "desc" },
    take: 50,
    include: {
      client: { select: { id: true, name: true, creditBalance: true } },
      sessionNote: true,
      payment: true,
    },
  });
}

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const sessions = await getSessions(session.user.id);

  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  const completedWithNotes = sessions.filter(
    (s) => s.status === "COMPLETED" && s.sessionNote
  );

  // Only count sessions that have already passed (endTime < now)
  const completedWithoutNotes = sessions.filter(
    (s) => s.status === "COMPLETED" && !s.sessionNote && new Date(s.endTime) < now
  );

  // Filter upcoming sessions only until end of month
  const allUpcoming = sessions.filter(
    (s) => s.status === "SCHEDULED" && new Date(s.startTime) <= monthEnd
  );

  // Categorize upcoming sessions
  const todaySessions = allUpcoming.filter((s) => {
    const startTime = new Date(s.startTime);
    return startTime >= today && startTime < tomorrow;
  });

  const tomorrowSessions = allUpcoming.filter((s) => {
    const startTime = new Date(s.startTime);
    return startTime >= tomorrow && startTime < dayAfterTomorrow;
  });

  const thisWeekSessions = allUpcoming.filter((s) => {
    const startTime = new Date(s.startTime);
    return startTime >= dayAfterTomorrow && startTime <= weekEnd;
  });

  const thisMonthSessions = allUpcoming.filter((s) => {
    const startTime = new Date(s.startTime);
    return startTime > weekEnd && startTime <= monthEnd;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">פגישות וסיכומים</h1>
          <p className="text-muted-foreground">
            ניהול פגישות וכתיבת סיכומי טיפול
          </p>
        </div>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            ממתינים לטיפול ({completedWithoutNotes.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            היסטוריה ({completedWithNotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>פגישות ממתינות לסיכום</CardTitle>
              <CardDescription>
                פגישות שהסתיימו וטרם נכתב להן סיכום
              </CardDescription>
            </CardHeader>
            <CardContent>
              {completedWithoutNotes.length > 0 ? (
                <div className="space-y-3">
                  {completedWithoutNotes.map((therapySession) => (
                    <div
                      key={therapySession.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-200"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-center min-w-[50px]">
                          <div className="text-xl font-bold">
                            {format(new Date(therapySession.startTime), "d")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(therapySession.startTime), "MMM", { locale: he })}
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{therapySession.client?.name || "🌊 הפסקה"}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(therapySession.startTime), "HH:mm")} -{" "}
                            {format(new Date(therapySession.endTime), "HH:mm")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {therapySession.payment?.status === "PAID" ? (
                            <Badge className="bg-green-50 text-green-900 font-semibold border border-green-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              שולם
                            </Badge>
                          ) : therapySession.payment ? (
                            <Badge variant="secondary">ממתין לתשלום</Badge>
                          ) : null}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* כפתור ראשי - כתיבת סיכום */}
                        <Button asChild>
                          <Link href={`/dashboard/sessions/${therapySession.id}`}>
                            <FileText className="ml-2 h-4 w-4" />
                            כתוב סיכום
                          </Link>
                        </Button>

                        {/* תפריט אופציות נוספות */}
                        {therapySession.client && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/clients/${therapySession.client.id}`}>
                                  <User className="h-4 w-4 ml-2" />
                                  תיקית מטופל
                                </Link>
                              </DropdownMenuItem>
                              {therapySession.payment?.status !== "PAID" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/clients/${therapySession.client.id}?tab=payments`}>
                                      <CheckCircle className="h-4 w-4 ml-2" />
                                      סמן כשולם
                                    </Link>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="mx-auto h-12 w-12 mb-3 text-primary opacity-50" />
                  <p>כל הפגישות מסוכמות!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>פגישות עם סיכום</CardTitle>
            </CardHeader>
            <CardContent>
              {completedWithNotes.length > 0 ? (
                <div className="space-y-3">
                  {completedWithNotes.map((therapySession) => (
                    <div
                      key={therapySession.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-center min-w-[50px]">
                          <div className="text-xl font-bold">
                            {format(new Date(therapySession.startTime), "d")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(therapySession.startTime), "MMM", { locale: he })}
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{therapySession.client?.name || "🌊 הפסקה"}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {therapySession.sessionNote?.content.slice(0, 100)}...
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Badges */}
                          {therapySession.payment?.status === "PAID" ? (
                            <Badge className="bg-green-50 text-green-900 font-semibold border border-green-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              שולם
                            </Badge>
                          ) : therapySession.payment ? (
                            <Badge variant="secondary">ממתין לתשלום</Badge>
                          ) : null}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* כפתור ראשי - משתנה לפי מצב */}
                        {therapySession.client && therapySession.payment?.status !== "PAID" ? (
                          <QuickMarkPaid
                            sessionId={therapySession.id}
                            clientId={therapySession.client.id}
                            clientName={therapySession.client.name}
                            amount={Number(therapySession.price)}
                            creditBalance={Number(therapySession.client.creditBalance || 0)}
                            existingPayment={therapySession.payment}
                            buttonText="תשלום מהיר"
                          />
                        ) : (
                          <Button variant="outline" asChild>
                            <Link href={`/dashboard/sessions/${therapySession.id}`}>
                              <Eye className="h-4 w-4 ml-1" />
                              צפה
                            </Link>
                          </Button>
                        )}

                        {/* תפריט אופציות נוספות */}
                        {therapySession.client && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/sessions/${therapySession.id}`}>
                                  <FileText className="h-4 w-4 ml-2" />
                                  ערוך סיכום
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/clients/${therapySession.client.id}`}>
                                  <User className="h-4 w-4 ml-2" />
                                  תיקית מטופל
                                </Link>
                              </DropdownMenuItem>
                              {therapySession.payment?.status !== "PAID" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/clients/${therapySession.client.id}?tab=payments`}>
                                      <CheckCircle className="h-4 w-4 ml-2" />
                                      סמן כשולם
                                    </Link>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין פגישות עם סיכום עדיין</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upcoming sessions moved to history tab */}
        <TabsContent value="history-upcoming" className="mt-6">
          <div className="space-y-6">
            {/* Today's Sessions */}
            {todaySessions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground px-2 py-1 rounded text-sm">היום</span>
                    <span className="text-muted-foreground font-normal text-sm">({todaySessions.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {todaySessions.map((therapySession) => (
                      <div
                        key={therapySession.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[50px]">
                            <div className="text-xl font-bold text-primary">
                              {format(new Date(therapySession.startTime), "HH:mm")}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium">{therapySession.client?.name || "🌊 הפסקה"}</p>
                            <p className="text-sm text-muted-foreground">
                              {therapySession.type === "BREAK" ? "הפסקה" : therapySession.type === "ONLINE" ? "אונליין" : "פרונטלי"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {therapySession.client && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/clients/${therapySession.client.id}`}>
                                  <User className="h-4 w-4 ml-1" />
                                  תיקית מטופל
                                </Link>
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/sessions/${therapySession.id}`}>
                                  <FileText className="h-4 w-4 ml-1" />
                                  סיכום פגישה
                                </Link>
                              </Button>
                            </>
                          )}
                          
                          {therapySession.client && (!therapySession.sessionNote || !therapySession.payment || therapySession.payment.status !== "PAID") && (
                            <CompleteSessionDialog
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              sessionDate={format(new Date(therapySession.startTime), "d/M/yyyy HH:mm")}
                              defaultAmount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              hasNote={!!therapySession.sessionNote}
                              hasPayment={therapySession.payment?.status === "PAID"}
                              buttonText="סיום ותשלום"
                            />
                          )}
                          
                          {therapySession.client && therapySession.payment?.status !== "PAID" && therapySession.sessionNote && (
                            <QuickMarkPaid
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              amount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              existingPayment={therapySession.payment}
                              buttonText="תשלום"
                            />
                          )}
                          
                          {therapySession.sessionNote && (
                            <Badge className="bg-green-50 text-green-900 font-semibold border border-green-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              סוכם
                            </Badge>
                          )}
                          
                          {therapySession.payment?.status === "PAID" && (
                            <Badge className="bg-blue-50 text-blue-900 font-semibold border border-blue-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              שולם
                            </Badge>
                          )}
                          
                          <Badge variant="default">היום</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tomorrow's Sessions */}
            {tomorrowSessions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="bg-blue-500 text-white px-2 py-1 rounded text-sm">מחר</span>
                    <span className="text-muted-foreground font-normal text-sm">({tomorrowSessions.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tomorrowSessions.map((therapySession) => (
                      <div
                        key={therapySession.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-blue-50 border border-blue-200"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[50px]">
                            <div className="text-xl font-bold text-blue-600">
                              {format(new Date(therapySession.startTime), "HH:mm")}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium">{therapySession.client?.name || "🌊 הפסקה"}</p>
                            <p className="text-sm text-muted-foreground">
                              {therapySession.type === "BREAK" ? "הפסקה" : therapySession.type === "ONLINE" ? "אונליין" : "פרונטלי"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {therapySession.client && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/clients/${therapySession.client.id}`}>
                                  <User className="h-4 w-4 ml-1" />
                                  תיקית מטופל
                                </Link>
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/sessions/${therapySession.id}`}>
                                  <FileText className="h-4 w-4 ml-1" />
                                  סיכום פגישה
                                </Link>
                              </Button>
                            </>
                          )}
                          
                          {therapySession.client && (!therapySession.sessionNote || !therapySession.payment || therapySession.payment.status !== "PAID") && (
                            <CompleteSessionDialog
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              sessionDate={format(new Date(therapySession.startTime), "d/M/yyyy HH:mm")}
                              defaultAmount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              hasNote={!!therapySession.sessionNote}
                              hasPayment={therapySession.payment?.status === "PAID"}
                              buttonText="סיום ותשלום"
                            />
                          )}
                          
                          {therapySession.client && therapySession.payment?.status !== "PAID" && therapySession.sessionNote && (
                            <QuickMarkPaid
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              amount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              existingPayment={therapySession.payment}
                              buttonText="תשלום"
                            />
                          )}
                          
                          {therapySession.sessionNote && (
                            <Badge className="bg-green-50 text-green-900 font-semibold border border-green-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              סוכם
                            </Badge>
                          )}
                          
                          {therapySession.payment?.status === "PAID" && (
                            <Badge className="bg-blue-50 text-blue-900 font-semibold border border-blue-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              שולם
                            </Badge>
                          )}
                          
                          <Badge variant="secondary">מחר</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* This Week's Sessions */}
            {thisWeekSessions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="bg-amber-500 text-white px-2 py-1 rounded text-sm">השבוע</span>
                    <span className="text-muted-foreground font-normal text-sm">({thisWeekSessions.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {thisWeekSessions.map((therapySession) => (
                      <div
                        key={therapySession.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-200"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[50px]">
                            <div className="text-xl font-bold">
                              {format(new Date(therapySession.startTime), "d")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(therapySession.startTime), "EEE", { locale: he })}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium">{therapySession.client?.name || "🌊 הפסקה"}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(therapySession.startTime), "HH:mm")}
                              {" • "}
                              {therapySession.type === "BREAK" ? "הפסקה" : therapySession.type === "ONLINE" ? "אונליין" : "פרונטלי"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {therapySession.client && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/clients/${therapySession.client.id}`}>
                                  <User className="h-4 w-4 ml-1" />
                                  תיקית מטופל
                                </Link>
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/sessions/${therapySession.id}`}>
                                  <FileText className="h-4 w-4 ml-1" />
                                  סיכום פגישה
                                </Link>
                              </Button>
                            </>
                          )}
                          
                          {therapySession.client && (!therapySession.sessionNote || !therapySession.payment || therapySession.payment.status !== "PAID") && (
                            <CompleteSessionDialog
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              sessionDate={format(new Date(therapySession.startTime), "d/M/yyyy HH:mm")}
                              defaultAmount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              hasNote={!!therapySession.sessionNote}
                              hasPayment={therapySession.payment?.status === "PAID"}
                              buttonText="סיום ותשלום"
                            />
                          )}
                          
                          {therapySession.client && therapySession.payment?.status !== "PAID" && therapySession.sessionNote && (
                            <QuickMarkPaid
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              amount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              existingPayment={therapySession.payment}
                              buttonText="תשלום"
                            />
                          )}
                          
                          {therapySession.sessionNote && (
                            <Badge className="bg-green-50 text-green-900 font-semibold border border-green-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              סוכם
                            </Badge>
                          )}
                          
                          {therapySession.payment?.status === "PAID" && (
                            <Badge className="bg-blue-50 text-blue-900 font-semibold border border-blue-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              שולם
                            </Badge>
                          )}
                          
                          <Badge variant="outline">השבוע</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* This Month's Sessions */}
            {thisMonthSessions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="bg-gray-500 text-white px-2 py-1 rounded text-sm">החודש</span>
                    <span className="text-muted-foreground font-normal text-sm">({thisMonthSessions.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {thisMonthSessions.map((therapySession) => (
                      <div
                        key={therapySession.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[50px]">
                            <div className="text-xl font-bold">
                              {format(new Date(therapySession.startTime), "d")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(therapySession.startTime), "MMM", { locale: he })}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium">{therapySession.client?.name || "🌊 הפסקה"}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(therapySession.startTime), "EEEE HH:mm", { locale: he })}
                              {" • "}
                              {therapySession.type === "BREAK" ? "הפסקה" : therapySession.type === "ONLINE" ? "אונליין" : "פרונטלי"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {therapySession.client && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/clients/${therapySession.client.id}`}>
                                  <User className="h-4 w-4 ml-1" />
                                  תיקית מטופל
                                </Link>
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/sessions/${therapySession.id}`}>
                                  <FileText className="h-4 w-4 ml-1" />
                                  סיכום פגישה
                                </Link>
                              </Button>
                            </>
                          )}
                          
                          {therapySession.client && (!therapySession.sessionNote || !therapySession.payment || therapySession.payment.status !== "PAID") && (
                            <CompleteSessionDialog
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              sessionDate={format(new Date(therapySession.startTime), "d/M/yyyy HH:mm")}
                              defaultAmount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              hasNote={!!therapySession.sessionNote}
                              hasPayment={therapySession.payment?.status === "PAID"}
                              buttonText="סיום ותשלום"
                            />
                          )}
                          
                          {therapySession.client && therapySession.payment?.status !== "PAID" && therapySession.sessionNote && (
                            <QuickMarkPaid
                              sessionId={therapySession.id}
                              clientId={therapySession.client.id}
                              clientName={therapySession.client.name}
                              amount={Number(therapySession.price)}
                              creditBalance={Number(therapySession.client.creditBalance || 0)}
                              existingPayment={therapySession.payment}
                              buttonText="תשלום"
                            />
                          )}
                          
                          {therapySession.sessionNote && (
                            <Badge className="bg-green-50 text-green-900 font-semibold border border-green-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              סוכם
                            </Badge>
                          )}
                          
                          {therapySession.payment?.status === "PAID" && (
                            <Badge className="bg-blue-50 text-blue-900 font-semibold border border-blue-200">
                              <CheckCircle className="h-3 w-3 ml-1" />
                              שולם
                            </Badge>
                          )}
                          
                          <Badge variant="outline">החודש</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No sessions message */}
            {allUpcoming.length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                    <p>אין פגישות קרובות</p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href="/dashboard/calendar">קבע פגישה</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}













