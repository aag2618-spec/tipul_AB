import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  Calendar,
  CreditCard,
  Edit,
  FileText,
  Mic,
  Phone,
  Mail,
  MapPin,
  Cake,
  Plus,
  Send,
  Stethoscope,
  Search,
  FolderOpen,
  Download,
  CheckCircle,
  ClipboardList,
  Repeat,
  Clock,
  MoreVertical,
  Eye,
  User as UserIcon,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { CompleteSessionDialog } from "@/components/sessions/complete-session-dialog";
import { ExportClientButton } from "@/components/clients/export-client-button";
import { QuickSessionStatus } from "@/components/sessions/quick-session-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SummariesTab } from "@/components/clients/summaries-tab";
import { SendReminderButton } from "@/components/clients/send-reminder-button";
import { SendPaymentHistoryButton } from "@/components/clients/send-payment-history-button";
import { TodaySessionCard } from "@/components/dashboard/today-session-card";
import { AddCreditDialog } from "@/components/clients/add-credit-dialog";
import { PaymentHistoryItem } from "@/components/payments/payment-history-item";
import { format } from "date-fns";
import { he } from "date-fns/locale";

async function getClient(clientId: string, userId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, therapistId: userId },
    include: {
      recurringPatterns: {
        where: { isActive: true },
        orderBy: { dayOfWeek: "asc" },
      },
      therapySessions: {
        orderBy: { startTime: "desc" },
        take: 20,
        include: { sessionNote: true, payment: true },
      },
      payments: {
        where: { parentPaymentId: null }, // Only get parent payments
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { 
          session: true,
          childPayments: {
            orderBy: { paidAt: "asc" },
          },
        },
      },
      recordings: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { transcription: { include: { analysis: true } } },
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
      questionnaireResponses: {
        orderBy: { completedAt: "desc" },
        include: {
          template: true,
        },
      },
      intakeResponses: {
        orderBy: { filledAt: "desc" },
        include: {
          template: true,
        },
      },
      _count: {
        select: { 
          therapySessions: { where: { type: { not: "BREAK" } } }, 
          payments: true, 
          recordings: true, 
          questionnaireResponses: true,
          intakeResponses: true
        },
      },
    },
  });
}

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const { id } = await params;
  const client = await getClient(id, session.user.id);

  if (!client) {
    notFound();
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);
  };

  const age = client.birthDate
    ? Math.floor(
        (new Date().getTime() - new Date(client.birthDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  const pendingPayments = client.payments.filter((p) => p.status === "PENDING");
  const totalDebt = pendingPayments.reduce(
    (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
    0
  );

  // Get unpaid sessions for the Payments tab
  const unpaidSessions = client.therapySessions.filter(
    (session) =>
      session.payment &&
      session.payment.status === "PENDING" &&
      Number(session.payment.expectedAmount) > Number(session.payment.amount)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/clients">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
              <Badge
                variant={
                  client.status === "ACTIVE"
                    ? "default"
                    : client.status === "WAITING"
                    ? "secondary"
                    : client.status === "INACTIVE"
                    ? "outline"
                    : "outline"
                }
                className={
                  client.status === "ACTIVE" 
                    ? "bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200" 
                    : client.status === "WAITING" 
                    ? "bg-amber-50 text-amber-900 font-semibold border border-amber-200" 
                    : client.status === "INACTIVE"
                    ? "bg-slate-50 text-slate-900 font-semibold border border-slate-200"
                    : "bg-purple-50 text-purple-900 font-semibold border border-purple-200"
                }
              >
                {client.status === "ACTIVE"
                  ? "פעיל"
                  : client.status === "WAITING"
                  ? "ממתין"
                  : client.status === "INACTIVE"
                  ? "לא פעיל"
                  : "בארכיון"}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {client._count.therapySessions} פגישות | מטופל מאז{" "}
              {format(new Date(client.createdAt), "MMMM yyyy", { locale: he })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportClientButton clientId={client.id} clientName={client.name} />
          <Button variant="outline" asChild>
            <Link href={`/dashboard/clients/${client.id}/edit`}>
              <Edit className="ml-2 h-4 w-4" />
              עריכה
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/calendar?client=${client.id}`}>
              <Plus className="ml-2 h-4 w-4" />
              קבע פגישה
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Info Bar - Compact */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              {/* Phone */}
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium" dir="ltr">
                  {client.phone || "לא צוין"}
                </span>
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Email */}
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium truncate max-w-[200px]" dir="ltr">
                  {client.email || "לא צוין"}
                </span>
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Age */}
              <div className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {age ? `${age} שנים` : "לא צוין"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credit/Debt Card */}
        <Card className={`transition-all ${
          totalDebt > 0 ? "border-red-200 bg-red-50/50" : "border-green-200 bg-green-50/50"
        }`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <CreditCard className={`h-6 w-6 ${
                  totalDebt > 0 ? "text-red-600" : "text-green-600"
                }`} />
                <div className="space-y-1">
                  {/* חוב */}
                  <div>
                    <p className="text-xs text-muted-foreground">חוב</p>
                    <p className={`text-xl font-bold ${totalDebt > 0 ? "text-red-600" : "text-gray-400"}`}>
                      ₪{totalDebt}
                    </p>
                  </div>
                  {/* קרדיט */}
                  <div>
                    <p className="text-xs text-muted-foreground">קרדיט</p>
                    <p className={`text-xl font-bold ${Number(client.creditBalance) > 0 ? "text-green-600" : "text-gray-400"}`}>
                      ₪{Number(client.creditBalance)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <AddCreditDialog
                  clientId={client.id}
                  clientName={client.name}
                  currentCredit={Number(client.creditBalance)}
                />
                {totalDebt > 0 && (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/payments/pay/${client.id}`}>
                        תשלום
                      </Link>
                    </Button>
                    <SendReminderButton
                      clientId={client.id}
                      clientName={client.name}
                      variant="outline"
                      size="sm"
                    />
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs - Simplified */}
      <Tabs defaultValue="sessions" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-5xl">
          <TabsTrigger value="sessions" className="gap-2">
            <Calendar className="h-4 w-4" />
            פגישות
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="h-4 w-4" />
            תשלומים
          </TabsTrigger>
          <TabsTrigger value="summaries" className="gap-2">
            <FileText className="h-4 w-4" />
            סיכומים
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            קבצים
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2">
            <UserIcon className="h-4 w-4" />
            פרופיל מלא
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-6">
          {/* Recurring Pattern Card */}
          {client.recurringPatterns && client.recurringPatterns.length > 0 && (
            <Card className="mb-4 border-primary/20 bg-primary/5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">מפגש קבוע</CardTitle>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/calendar?client=${client.id}`}>
                      <Edit className="h-3 w-3 ml-1" />
                      ערוך
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {client.recurringPatterns.map((pattern) => {
                  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
                  return (
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
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>פגישות</CardTitle>
              <CardDescription>
                {client._count.therapySessions} פגישות בסך הכל
              </CardDescription>
            </CardHeader>
            <CardContent>
              {client.therapySessions.length > 0 ? (
                <Tabs defaultValue="past" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="past">
                      פגישות שעבר זמנן ({client.therapySessions.filter(s => new Date(s.startTime) < new Date()).length})
                    </TabsTrigger>
                    <TabsTrigger value="upcoming">
                      פגישות עתידיות ({client.therapySessions.filter(s => new Date(s.startTime) >= new Date()).length})
                    </TabsTrigger>
                  </TabsList>

                  {/* פגישות שעבר זמנן */}
                  <TabsContent value="past">
                    {client.therapySessions.filter(s => new Date(s.startTime) < new Date()).length > 0 ? (
                      <div className="space-y-4">
                        {client.therapySessions
                          .filter(s => new Date(s.startTime) < new Date())
                          .map((session) => (
                            <TodaySessionCard 
                              key={session.id} 
                              session={{
                                id: session.id,
                                startTime: session.startTime,
                                endTime: session.endTime,
                                type: session.type as string,
                                status: session.status as string,
                                price: Number(session.price),
                                sessionNote: session.sessionNote ? "exists" : null,
                                payment: session.payment ? {
                                  id: session.payment.id,
                                  status: session.payment.status as string,
                                  amount: Number(session.payment.amount),
                                } : null,
                                client: {
                                  id: client.id,
                                  name: client.name,
                                  creditBalance: Number(client.creditBalance),
                                },
                              }} 
                            />
                          ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                        <p>אין פגישות קודמות</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* פגישות עתידיות */}
                  <TabsContent value="upcoming">
                    {client.therapySessions.filter(s => new Date(s.startTime) >= new Date()).length > 0 ? (
                      <div className="space-y-4">
                        {client.therapySessions
                          .filter(s => new Date(s.startTime) >= new Date())
                          .map((session) => (
                            <TodaySessionCard 
                              key={session.id} 
                              session={{
                                id: session.id,
                                startTime: session.startTime,
                                endTime: session.endTime,
                                type: session.type as string,
                                status: session.status as string,
                                price: Number(session.price),
                                sessionNote: session.sessionNote ? "exists" : null,
                                payment: session.payment ? {
                                  id: session.payment.id,
                                  status: session.payment.status as string,
                                  amount: Number(session.payment.amount),
                                } : null,
                                client: {
                                  id: client.id,
                                  name: client.name,
                                  creditBalance: Number(client.creditBalance),
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
                          <Link href={`/dashboard/calendar?client=${client.id}`}>
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
                    <Link href={`/dashboard/calendar?client=${client.id}`}>
                      קבע פגישה ראשונה
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-6">
          <Tabs defaultValue="pending" className="w-full">
            <TabsList>
              <TabsTrigger value="pending">⏳ ממתינים לתשלום</TabsTrigger>
              <TabsTrigger value="history">📊 היסטוריית תשלומים</TabsTrigger>
            </TabsList>

            {/* Pending Payments */}
            <TabsContent value="pending" className="mt-4">
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="flex gap-2 justify-end">
                  {totalDebt > 0 && (
                    <>
                      <SendReminderButton
                        clientId={client.id}
                        clientName={client.name}
                        size="default"
                      />
                      <Button asChild className="gap-2">
                        <Link href={`/dashboard/payments/pay/${client.id}`}>
                          <CreditCard className="h-4 w-4" />
                          תשלום מהיר על הכל
                        </Link>
                      </Button>
                    </>
                  )}
                </div>

                {/* Unpaid Sessions List */}
                <Card>
                  <CardHeader>
                    <CardTitle>פגישות שטרם שולמו</CardTitle>
                    <CardDescription>
                      {unpaidSessions.length} פגישות • סה"כ חוב: ₪{totalDebt}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {unpaidSessions.length > 0 ? (
                      <div className="space-y-3">
                        {unpaidSessions.map((session) => {
                          const sessionPrice = Number(session.price);
                          const alreadyPaid = session.payment ? Number(session.payment.amount) : 0;
                          const debt = sessionPrice - alreadyPaid;

                          return (
                            <div
                              key={session.id}
                              className="flex items-center justify-between p-4 rounded-lg border bg-card"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <p className="font-medium">
                                    {format(new Date(session.startTime), "EEEE, d בMMMM yyyy", {
                                      locale: he,
                                    })}
                                  </p>
                                  <Badge variant="outline">
                                    {session.type === "ONLINE"
                                      ? "אונליין"
                                      : session.type === "PHONE"
                                      ? "טלפון"
                                      : "פרונטלי"}
                                  </Badge>
                                  <Badge
                                    variant={
                                      session.status === "COMPLETED"
                                        ? "default"
                                        : session.status === "CANCELLED"
                                        ? "destructive"
                                        : "secondary"
                                    }
                                  >
                                    {session.status === "COMPLETED"
                                      ? "הושלם"
                                      : session.status === "CANCELLED"
                                      ? "בוטל"
                                      : "אי הופעה"}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span>מחיר: ₪{sessionPrice}</span>
                                  {alreadyPaid > 0 && <span>שולם: ₪{alreadyPaid}</span>}
                                  <span className="font-bold text-red-600">חוב: ₪{debt}</span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {session.payment && (
                                  <Button variant="default" size="sm" asChild>
                                    <Link href={`/dashboard/payments/${session.payment.id}/mark-paid`}>
                                      <CreditCard className="h-4 w-4 ml-2" />
                                      שלם
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <CheckCircle className="mx-auto h-16 w-16 mb-4 text-green-500 opacity-50" />
                        <p className="text-lg font-medium mb-2">כל התשלומים שולמו! 🎉</p>
                        <p className="text-sm">אין חובות פתוחים למטופל זה</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Payment History */}
            <TabsContent value="history" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>היסטוריית תשלומים</CardTitle>
                      <CardDescription>כל התשלומים שנרשמו במערכת</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <SendPaymentHistoryButton
                        clientId={client.id}
                        clientEmail={client.email}
                        hasPayments={client.payments.length > 0}
                      />
                      <AddCreditDialog
                        clientId={client.id}
                        clientName={client.name}
                        currentCredit={Number(client.creditBalance)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {client.payments.length > 0 ? (
                    <div className="space-y-3">
                      {client.payments.map((payment) => (
                        <PaymentHistoryItem
                          key={payment.id}
                          payment={{
                            ...payment,
                            amount: Number(payment.amount),
                            expectedAmount: payment.expectedAmount ? Number(payment.expectedAmount) : null,
                            createdAt: payment.createdAt,
                            session: payment.session,
                            childPayments: payment.childPayments?.map((child) => ({
                              ...child,
                              amount: Number(child.amount),
                              paidAt: child.paidAt || child.createdAt,
                            })),
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <CreditCard className="mx-auto h-16 w-16 mb-4 opacity-50" />
                      <p className="text-lg mb-2">אין תשלומים עדיין</p>
                      <p className="text-sm">תשלומים שתרשום יופיעו כאן</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="summaries" className="mt-6">
          <SummariesTab clientId={client.id} sessions={client.therapySessions} />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <Tabs defaultValue="documents" className="w-full">
            <TabsList>
              <TabsTrigger value="documents">מסמכים</TabsTrigger>
              {/* הקלטות - מוסתר לעת עתה
              <TabsTrigger value="recordings">הקלטות</TabsTrigger>
              */}
            </TabsList>

            <TabsContent value="documents" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>מסמכים</CardTitle>
                    <CardDescription>
                      {client.documents.length} מסמכים
                    </CardDescription>
                  </div>
                  <Button asChild>
                    <Link href={`/dashboard/documents/upload?client=${client.id}`}>
                      <Plus className="ml-2 h-4 w-4" />
                      העלה מסמך
                    </Link>
                  </Button>
                </CardHeader>
            <CardContent>
              {client.documents.length > 0 ? (
                <div className="space-y-3">
                  {client.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-border bg-background"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(doc.createdAt), "dd/MM/yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-4 w-4 ml-2" />
                            פתח
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <a href={doc.fileUrl} download target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין מסמכים עדיין</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href={`/dashboard/documents/upload?client=${client.id}`}>
                      העלה מסמך ראשון
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            {/* הקלטות TabsContent - מוסתר לעת עתה
            <TabsContent value="recordings" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>הקלטות</CardTitle>
                    <CardDescription>
                      {client._count.recordings} הקלטות בסך הכל
                    </CardDescription>
                  </div>
                  <Button asChild>
                    <Link href={`/dashboard/recordings/new?client=${client.id}`}>
                      <Mic className="ml-2 h-4 w-4" />
                      הקלטה חדשה
                    </Link>
                  </Button>
                </CardHeader>
            <CardContent>
              {client.recordings.length > 0 ? (
                <div className="space-y-3">
                  {client.recordings.map((recording) => (
                    <div
                      key={recording.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Mic className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {recording.type === "INTAKE"
                              ? "שיחת קבלה"
                              : "הקלטת פגישה"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(
                              new Date(recording.createdAt),
                              "d/M/yyyy HH:mm"
                            )}{" "}
                            • {Math.floor(recording.durationSeconds / 60)} דקות
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            recording.status === "ANALYZED"
                              ? "default"
                              : recording.status === "ERROR"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {recording.status === "PENDING"
                            ? "ממתין"
                            : recording.status === "TRANSCRIBING"
                            ? "מתמלל"
                            : recording.status === "TRANSCRIBED"
                            ? "תומלל"
                            : recording.status === "ANALYZED"
                            ? "נותח"
                            : "שגיאה"}
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/recordings/${recording.id}`}>
                            צפה
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Mic className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין הקלטות עדיין</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href={`/dashboard/recordings/new?client=${client.id}`}>
                      הקלט שיחה ראשונה
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>
            */}
          </Tabs>
        </TabsContent>

        <TabsContent value="profile" className="mt-6">
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">פרטים אישיים</TabsTrigger>
              <TabsTrigger value="questionnaires">שאלונים ואבחון</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>פרטים נוספים</CardTitle>
                  </CardHeader>
              <CardContent className="space-y-4">
                {client.address && (
                  <div>
                    <p className="text-sm text-muted-foreground">כתובת</p>
                    <p className="font-medium">{client.address}</p>
                  </div>
                )}
                {client.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">הערות</p>
                    <p className="font-medium whitespace-pre-wrap">
                      {client.notes}
                    </p>
                  </div>
                )}
                {!client.address && !client.notes && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>אין פרטים נוספים</p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href={`/dashboard/clients/${client.id}/edit`}>
                        הוסף פרטים
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>שלח מייל למטופל</CardTitle>
                <CardDescription>
                  {client.email ? `ישלח ל-${client.email}` : "למטופל אין כתובת מייל"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {client.email ? (
                  <Button asChild className="w-full">
                    <Link href={`/dashboard/clients/${client.id}/email`}>
                      <Send className="ml-2 h-4 w-4" />
                      שלח מייל
                    </Link>
                  </Button>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Mail className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">הוסף כתובת מייל כדי לשלוח הודעות</p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href={`/dashboard/clients/${client.id}/edit`}>
                        ערוך פרטים
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
            </TabsContent>

            <TabsContent value="questionnaires" className="mt-4">
              <div className="space-y-6">
                {/* תשאול ראשוני */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>תשאול ראשוני</CardTitle>
                        <CardDescription>
                          {client._count.intakeResponses} שאלונים ממולאים
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {client.intakeResponses && client.intakeResponses.length > 0 ? (
                      <div className="space-y-3">
                        {client.intakeResponses.map((response: any) => (
                          <div
                            key={response.id}
                            className="p-4 rounded-lg border bg-card"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{response.template.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(response.filledAt), "dd/MM/yyyy HH:mm")}
                                </p>
                              </div>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/intake-responses/${response.id}`}>
                                  צפה
                                </Link>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>לא מולא תשאול ראשוני</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* שאלונים פסיכולוגיים */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>שאלונים פסיכולוגיים</CardTitle>
                        <CardDescription>
                          {client._count.questionnaireResponses} שאלונים ממולאים
                        </CardDescription>
                      </div>
                      <Button asChild>
                        <Link href={`/dashboard/questionnaires/new?client=${client.id}`}>
                          <Plus className="ml-2 h-4 w-4" />
                          שאלון חדש
                        </Link>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {client.questionnaireResponses.length > 0 ? (
                      <div className="space-y-3">
                        {client.questionnaireResponses.map((response) => (
                          <Link
                            key={response.id}
                            href={`/dashboard/questionnaires/${response.id}`}
                            className="block"
                          >
                            <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                  <ClipboardList className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">{response.template.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {response.completedAt
                                      ? format(new Date(response.completedAt), "dd/MM/yyyy HH:mm")
                                      : "בתהליך"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant={
                                    response.status === "COMPLETED"
                                      ? "default"
                                      : response.status === "ANALYZED"
                                      ? "secondary"
                                      : "outline"
                                  }
                                >
                                  {response.status === "COMPLETED"
                                    ? "הושלם"
                                    : response.status === "ANALYZED"
                                    ? "נותח"
                                    : "בתהליך"}
                                </Badge>
                                {response.totalScore !== null && (
                                  <Badge variant="outline">
                                    ציון: {response.totalScore}
                                  </Badge>
                                )}
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <ClipboardList className="mx-auto h-16 w-16 mb-4 opacity-50" />
                        <p className="text-lg mb-2">אין שאלונים ממולאים</p>
                        <p className="text-sm mb-4">
                          שאלונים מסייעים באבחון ומעקב אחר התקדמות הטיפול
                        </p>
                        <Button asChild>
                          <Link href={`/dashboard/questionnaires/new?client=${client.id}`}>
                            <Plus className="ml-2 h-4 w-4" />
                            מלא שאלון ראשון
                          </Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* אבחון והערות */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>אבחון ראשוני</CardTitle>
                      <CardDescription>האבחון שלך לגבי המטופל</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {client.initialDiagnosis ? (
                        <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                          {client.initialDiagnosis}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Stethoscope className="mx-auto h-12 w-12 mb-3 opacity-50" />
                          <p>לא הוזן אבחון ראשוני</p>
                          <Button variant="link" asChild className="mt-2">
                            <Link href={`/dashboard/clients/${client.id}/edit`}>
                              הוסף אבחון
                            </Link>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>הערות תשאול ראשוני</CardTitle>
                      <CardDescription>מהשיחה הראשונית עם המטופל</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {client.intakeNotes ? (
                        <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                          {client.intakeNotes}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="mx-auto h-12 w-12 mb-3 opacity-50" />
                          <p>אין הערות תשאול</p>
                          <Button variant="link" asChild className="mt-2">
                            <Link href={`/dashboard/intake/${client.id}`}>
                              מלא תשאול ראשוני
                            </Link>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}







