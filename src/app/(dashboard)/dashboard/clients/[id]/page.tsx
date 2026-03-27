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
  Lock,
  Sparkles,
  Brain,
  UserCheck,
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
import { ClientApproachEditor } from "@/components/clients/client-approach-editor";
import { DocumentItem } from "@/components/clients/document-item";
import { SendReminderButton } from "@/components/clients/send-reminder-button";
import { SendPaymentHistoryButton } from "@/components/clients/send-payment-history-button";
import { SendBookingLinkButton } from "@/components/clients/send-booking-link-button";
import { TodaySessionCard } from "@/components/dashboard/today-session-card";
import { SessionHistoryGrid } from "@/components/clients/session-history-grid";
import { AddCreditDialog } from "@/components/clients/add-credit-dialog";
import { PaymentHistoryItem } from "@/components/payments/payment-history-item";
import { PaymentHistoryGrid } from "@/components/payments/payment-history-grid";
import { QuestionnaireAnalysis } from "@/components/ai/questionnaire-analysis";
import { SessionPrepCard } from "@/components/ai/session-prep-card";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { calculateDebtFromPayments, calculateSessionDebt } from "@/lib/payment-utils";

async function getClient(clientId: string, userId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, therapistId: userId },
    include: {
      recurringPatterns: {
        where: { isActive: true },
        orderBy: { dayOfWeek: "asc" },
      },
      therapySessions: {
        orderBy: { startTime: "desc" },
        include: {
          sessionNote: true,
          payment: { include: { childPayments: { orderBy: { paidAt: "asc" } } } },
        },
      },
      payments: {
        where: { parentPaymentId: null },
        orderBy: { createdAt: "desc" },
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
  if (!client) return null;
  // ניקוי כולל: Prisma Decimal → string, Date → ISO string
  // מונע שגיאות RSC serialization בכל client components
  return JSON.parse(JSON.stringify(client)) as typeof client;
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; upgrade?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const { id } = await params;
  const { tab, upgrade } = await searchParams;
  const defaultTab = tab || "sessions";
  const showUpgradeBanner = upgrade === "true";
  
  // קבלת פרטי המשתמש כולל tier
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { aiTier: true }
  });
  
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
  const totalDebt = calculateDebtFromPayments(pendingPayments);

  // AI tab data
  const futureSessions = client.therapySessions.filter(
    (s) => new Date(s.startTime) > new Date() && s.type !== "BREAK"
  );
  const nextUpcomingSession = futureSessions.length > 0 
    ? futureSessions[futureSessions.length - 1] 
    : null;
  const summarizedSessionsCount = client.therapySessions.filter(s => s.sessionNote).length;

  // Get unpaid sessions for the Payments tab (exclude cancelled sessions)
  const unpaidSessions = client.therapySessions.filter(
    (session) =>
      session.status !== "CANCELLED" &&
      session.payment &&
      session.payment.status === "PENDING" &&
      Number(session.payment.expectedAmount || 0) > Number(session.payment.amount || 0)
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
                    : "outline"
                }
                className={
                  client.status === "ACTIVE" 
                    ? "bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200" 
                    : client.status === "WAITING" 
                    ? "bg-amber-50 text-amber-900 font-semibold border border-amber-200" 
                    : "bg-slate-50 text-slate-900 font-semibold border border-slate-200"
                }
              >
                {client.status === "ACTIVE"
                  ? "פעיל"
                  : client.status === "WAITING"
                  ? "ממתין"
                  : "ארכיון"}
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
          {client.email && (
            <SendBookingLinkButton clientId={client.id} clientName={client.name} />
          )}
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
                <Mail className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-muted-foreground truncate max-w-[200px]" dir="ltr">
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

        {/* Debt & Credit Summary Card - Clickable */}
        <a href={`/dashboard/clients/${client.id}?tab=payments`}>
          <Card className={`transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] ${
            totalDebt > 0 ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/50"
          }`}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className={`h-5 w-5 ${
                    totalDebt > 0 ? "text-red-500" : "text-emerald-500"
                  }`} />
                  {totalDebt > 0 ? (
                    <div>
                      <p className="text-sm text-muted-foreground">חוב פתוח</p>
                      <p className="text-xl font-bold text-red-600">₪{totalDebt}</p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-emerald-700">אין חובות פתוחים ✓</p>
                  )}
                </div>
                {Number(client.creditBalance) > 0 && (
                  <div className="text-left">
                    <p className="text-sm text-muted-foreground">קרדיט</p>
                    <p className="text-lg font-bold text-emerald-600">₪{Number(client.creditBalance)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </a>
      </div>

      {/* באנר שדרוג — פונה מזדמן */}
      {(client.isQuickClient || showUpgradeBanner) && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div>
            <p className="font-medium text-blue-800">זהו פונה מזדמן (פגישת ייעוץ)</p>
            <p className="text-sm text-blue-600">השלם פרטים כדי להפוך למטופל קבוע</p>
          </div>
          <a
            href={`/dashboard/clients/${client.id}?tab=profile`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <UserCheck className="h-4 w-4" />
            השלם פרטים ושדרג
          </a>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} key={defaultTab} className="w-full">
        <div className="flex w-full gap-2">
          <TabsList className="flex w-full gap-1.5 h-auto p-0 bg-transparent">
          <TabsTrigger value="sessions" className="flex-1 gap-2 rounded-xl py-2.5 border border-muted-foreground/10 bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border-primary/30 font-medium">
            <Calendar className="h-4 w-4" />
            פגישות
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex-1 gap-2 rounded-xl py-2.5 border border-muted-foreground/10 bg-muted/40 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border-primary/30 font-medium">
            <Sparkles className="h-4 w-4" />
            AI · ניתוח
          </TabsTrigger>
          <TabsTrigger value="summaries" className="flex-1 gap-2 rounded-xl py-2.5 border border-muted-foreground/10 bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border-primary/30 font-medium">
            <FileText className="h-4 w-4" />
            סיכומים
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 gap-2 rounded-xl py-2.5 border border-muted-foreground/10 bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border-primary/30 font-medium">
            <CreditCard className="h-4 w-4" />
            תשלומים
          </TabsTrigger>
          <TabsTrigger value="files" className="flex-1 gap-2 rounded-xl py-2.5 border border-muted-foreground/10 bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border-primary/30 font-medium">
            <FolderOpen className="h-4 w-4" />
            קבצים
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex-1 gap-2 rounded-xl py-2.5 border border-muted-foreground/10 bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border-primary/30 font-medium">
            <UserIcon className="h-4 w-4" />
            פרופיל
          </TabsTrigger>
        </TabsList>
        </div>

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
                      היסטוריית פגישות ({client.therapySessions.filter(s => new Date(s.startTime) < new Date()).length})
                    </TabsTrigger>
                    <TabsTrigger value="upcoming">
                      פגישות עתידיות ({client.therapySessions.filter(s => new Date(s.startTime) >= new Date()).length})
                    </TabsTrigger>
                  </TabsList>

                  {/* היסטוריית פגישות */}
                  <TabsContent value="past">
                    {client.therapySessions.filter(s => new Date(s.startTime) < new Date()).length > 0 ? (
                      <SessionHistoryGrid
                        sessions={client.therapySessions
                          .filter(s => new Date(s.startTime) < new Date())
                          .map((session) => ({
                            id: session.id,
                            startTime: session.startTime.toString(),
                            endTime: session.endTime.toString(),
                            type: session.type as string,
                            status: session.status as string,
                            price: Number(session.price),
                            sessionNote: session.sessionNote?.content || null,
                            cancellationReason: session.cancellationReason,
                            payment: session.payment ? {
                              id: session.payment.id,
                              status: session.payment.status as string,
                              amount: Number(session.payment.amount || 0),
                              expectedAmount: Number(session.payment.expectedAmount || 0),
                            } : null,
                            client: {
                              id: client.id,
                              name: client.name,
                              creditBalance: Number(client.creditBalance),
                              totalDebt,
                              unpaidSessionsCount: unpaidSessions.length,
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
                    {client.therapySessions.filter(s => new Date(s.startTime) >= new Date()).length > 0 ? (
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        {client.therapySessions
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
                                  amount: Number(session.payment.amount || 0),
                                  expectedAmount: Number(session.payment.expectedAmount || 0),
                                } : null,
                                client: {
                                  id: client.id,
                                  name: client.name,
                                  creditBalance: Number(client.creditBalance),
                                  totalDebt,
                                  unpaidSessionsCount: unpaidSessions.length,
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
                    {Number(client.creditBalance) > 0 && (
                      <p className="text-sm text-muted-foreground">
                        קרדיט: <span className="font-bold text-emerald-600">₪{Number(client.creditBalance)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <AddCreditDialog
                      clientId={client.id}
                      clientName={client.name}
                      currentCredit={Number(client.creditBalance)}
                    />
                    {totalDebt > 0 && (
                      <>
                        <SendReminderButton
                          clientId={client.id}
                          clientName={client.name}
                          size="default"
                        />
                        {unpaidSessions.length > 1 && (
                          <Button asChild className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                            <Link href={`/dashboard/payments/pay/${client.id}`}>
                              <CreditCard className="h-4 w-4" />
                              שלם הכל
                            </Link>
                          </Button>
                        )}
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
                                    session.payment.childPayments.map((child: { id: string; amount: unknown; paidAt: Date | string | null }, idx: number) => {
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
                                        {session.payment.paidAt && (
                                          <span className="text-muted-foreground mr-1">
                                            · {format(new Date(session.payment.paidAt), "dd/MM/yyyy")}
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
                          clientId={client.id}
                          clientName={client.name}
                          amount={debt}
                          creditBalance={Number(client.creditBalance || 0)}
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
                        <Link key={session.id} href={`/dashboard/payments/pay/${client.id}`}>
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

            {/* Payment History - רק תשלומים ששולמו במלואם */}
            <TabsContent value="history" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">היסטוריית תשלומים</h3>
                    <p className="text-sm text-muted-foreground">תשלומים שהושלמו במלואם</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SendPaymentHistoryButton
                      clientId={client.id}
                      clientEmail={client.email}
                      hasPayments={client.payments.filter(p => p.status === "PAID").length > 0}
                    />
                    <AddCreditDialog
                      clientId={client.id}
                      clientName={client.name}
                      currentCredit={Number(client.creditBalance)}
                    />
                  </div>
                </div>

                {/* רשימת תשלומים עם אפשרות סינון לפי תאריך */}
                <PaymentHistoryGrid
                  payments={client.payments.map((payment) => ({
                    id: payment.id,
                    amount: Number(payment.amount),
                    expectedAmount: payment.expectedAmount ? Number(payment.expectedAmount) : null,
                    method: payment.method as string,
                    status: payment.status as string,
                    createdAt: payment.createdAt,
                    paidAt: payment.paidAt,
                    session: payment.session ? {
                      id: payment.session.id,
                      startTime: payment.session.startTime,
                      type: payment.session.type as string,
                    } : null,
                    childPayments: payment.childPayments?.map((child) => ({
                      id: child.id,
                      amount: Number(child.amount),
                      method: (child.method || payment.method) as string,
                      paidAt: child.paidAt,
                      createdAt: child.createdAt,
                    })) || [],
                  }))}
                />
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai" className="mt-6">
          <div className="space-y-6">
            {/* הכנה לפגישה הקרובה */}
            {nextUpcomingSession ? (
              <SessionPrepCard
                session={{
                  id: nextUpcomingSession.id,
                  clientId: client.id,
                  clientName: client.name,
                  startTime: nextUpcomingSession.startTime,
                }}
                userTier={(user?.aiTier as "ESSENTIAL" | "PRO" | "ENTERPRISE") || "ESSENTIAL"}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Calendar className="mx-auto h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">אין פגישות קרובות</p>
                  <p className="text-sm mt-1">קבע פגישה כדי ליצור הכנת AI</p>
                </CardContent>
              </Card>
            )}

            {/* ניתוח מקיף של כל הסיכומים */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  ניתוח מקיף
                </CardTitle>
                <CardDescription>
                  ניתוח AI שמשלב את כל סיכומי הפגישות ומזהה דפוסים, התקדמות ותובנות
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summarizedSessionsCount > 0 ? (
                  <Button asChild className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 shadow-none">
                    <Link href={`/dashboard/clients/${client.id}/summaries/all`}>
                      <Sparkles className="ml-2 h-4 w-4" />
                      התחל ניתוח מקיף ({summarizedSessionsCount} סיכומים)
                    </Link>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">אין סיכומים עדיין - סכם פגישות כדי להפעיל ניתוח מקיף</p>
                )}
              </CardContent>
            </Card>

            {/* ניתוח שאלונים */}
            {client.questionnaireResponses && client.questionnaireResponses.length > 0 ? (
              <QuestionnaireAnalysis
                clientId={client.id}
                clientName={client.name}
                questionnaires={client.questionnaireResponses}
                userTier={(user?.aiTier as "ESSENTIAL" | "PRO" | "ENTERPRISE") || "ESSENTIAL"}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <ClipboardList className="mx-auto h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">אין שאלונים לניתוח</p>
                  <p className="text-sm mt-1">מלא שאלונים כדי לקבל ניתוח AI</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href={`/dashboard/questionnaires/new?client=${client.id}`}>
                      <Plus className="ml-1 h-4 w-4" />
                      מלא שאלון
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* גישה טיפולית למטופל */}
            <Card className={user?.aiTier !== 'ENTERPRISE' ? 'border-dashed border-amber-300/50' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Stethoscope className="h-5 w-5" />
                      גישה טיפולית למטופל
                      {user?.aiTier !== 'ENTERPRISE' && <Lock className="h-4 w-4 text-amber-500" />}
                    </CardTitle>
                    <CardDescription>
                      {user?.aiTier === 'ENTERPRISE' 
                        ? 'הגדר גישות טיפוליות ספציפיות למטופל זה'
                        : 'שדרג לארגוני כדי להפעיל ניתוח מותאם אישית'}
                    </CardDescription>
                  </div>
                  {user?.aiTier !== 'ENTERPRISE' && (
                    <Badge className="bg-gradient-to-r from-amber-400 to-orange-400 text-white border-0 text-xs">
                      ENTERPRISE
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ClientApproachEditor
                  clientId={client.id}
                  clientName={client.name}
                  currentApproaches={client.therapeuticApproaches || []}
                  currentNotes={client.approachNotes}
                  currentCulturalContext={client.culturalContext}
                  disabled={user?.aiTier !== 'ENTERPRISE'}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="summaries" className="mt-6">
          <SummariesTab clientId={client.id} sessions={client.therapySessions.map(s => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            type: s.type as string,
            status: s.status as string,
            skipSummary: s.skipSummary,
            sessionNote: s.sessionNote ? { content: s.sessionNote.content } : null,
          }))} />
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
                    <DocumentItem
                      key={doc.id}
                      doc={{
                        id: doc.id,
                        name: doc.name,
                        fileUrl: doc.fileUrl,
                        createdAt: doc.createdAt.toString(),
                      }}
                    />
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
                                <p className="font-medium">{response.template?.name || "תשאול ראשוני"}</p>
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
                                  <p className="font-medium">{response.template?.name || "שאלון"}</p>
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

                {/* ניתוח AI לשאלונים */}
                {client.questionnaireResponses && client.questionnaireResponses.length > 0 && (
                  <QuestionnaireAnalysis
                    clientId={client.id}
                    clientName={client.name}
                    questionnaires={client.questionnaireResponses}
                    userTier={(user?.aiTier as "ESSENTIAL" | "PRO" | "ENTERPRISE") || "ESSENTIAL"}
                    compact
                  />
                )}

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







