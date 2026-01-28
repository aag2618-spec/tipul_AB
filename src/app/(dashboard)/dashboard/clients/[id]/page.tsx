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
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
        orderBy: { createdAt: "desc" },
        take: 10,
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
      _count: {
        select: { 
          therapySessions: { where: { type: { not: "BREAK" } } }, 
          payments: true, 
          recordings: true, 
          questionnaireResponses: true 
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
                className={client.status === "WAITING" ? "bg-amber-100 text-amber-800" : ""}
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

            <div className="h-4 w-px bg-border" />

            {/* Credit/Debt */}
            <div className="flex items-center gap-2">
              <CreditCard className={`h-4 w-4 ${
                totalDebt > 0 ? "text-red-600" : "text-green-600"
              }`} />
              <div>
                {totalDebt > 0 ? (
                  <span className="text-sm font-bold text-red-600">
                    חוב: ₪{totalDebt}
                    {Number(client.creditBalance) > 0 && (
                      <span className="text-xs text-green-600 mr-2">
                        (קרדיט: ₪{Number(client.creditBalance)})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm font-bold text-green-600">
                    קרדיט: {Number(client.creditBalance) > 0 ? `₪${Number(client.creditBalance)}` : "₪0"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs - Simplified */}
      <Tabs defaultValue="sessions" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-3xl">
          <TabsTrigger value="sessions" className="gap-2">
            <Calendar className="h-4 w-4" />
            פגישות
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <FileText className="h-4 w-4" />
            תיעוד
          </TabsTrigger>
          <TabsTrigger value="questionnaires" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            הערכה
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            קבצים
          </TabsTrigger>
          <TabsTrigger value="info" className="gap-2">
            <UserIcon className="h-4 w-4" />
            פרטים
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
              <CardTitle>היסטוריית פגישות</CardTitle>
              <CardDescription>
                {client._count.therapySessions} פגישות בסך הכל
              </CardDescription>
            </CardHeader>
            <CardContent>
              {client.therapySessions.length > 0 ? (
                <div className="space-y-2">
                  {client.therapySessions.map((session) => {
                    const hasNote = !!session.sessionNote;
                    const isPaid = session.payment?.status === "PAID";
                    const isCompleted = session.status === "COMPLETED";
                    const isScheduled = session.status === "SCHEDULED";
                    
                    return (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        {/* תאריך ושעה */}
                        <div className="flex items-center gap-3 flex-1">
                          <div className="text-center min-w-[50px]">
                            <div className="text-lg font-bold">
                              {format(new Date(session.startTime), "d/M")}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {format(new Date(session.startTime), "HH:mm")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {session.type === "ONLINE" ? "אונליין" : session.type === "PHONE" ? "טלפון" : "פרונטלי"}
                              </span>
                            </div>
                            
                            {/* סטטוס קומפקטי */}
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              {isScheduled ? (
                                <span className="text-muted-foreground">⭕ מתוכננת</span>
                              ) : isCompleted ? (
                                <>
                                  <span className="text-green-600">✓ הושלם</span>
                                  <span className="text-muted-foreground">•</span>
                                  {hasNote ? (
                                    <span className="text-green-600">✓ מסוכם</span>
                                  ) : (
                                    <span className="text-amber-600">⚠️ חסר סיכום</span>
                                  )}
                                  <span className="text-muted-foreground">•</span>
                                  {isPaid ? (
                                    <span className="text-green-600">✓ שולם</span>
                                  ) : (
                                    <span className="text-red-600">⚠️ לא שולם ₪{Number(session.price)}</span>
                                  )}
                                </>
                              ) : session.status === "CANCELLED" ? (
                                <span className="text-red-600">✗ בוטל</span>
                              ) : (
                                <span className="text-red-600">✗ לא הגיע</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* פעולות - רק מה שצריך */}
                        <div className="flex items-center gap-2">
                          {isScheduled ? (
                            // פגישה מתוכננת - כפתורי סטטוס
                            <QuickSessionStatus
                              sessionId={session.id}
                              clientId={client.id}
                              currentStatus={session.status}
                            />
                          ) : isCompleted ? (
                            // פגישה שהושלמה - הצג רק מה שחסר
                            <>
                              {!hasNote && (
                                <Button size="sm" variant="default" asChild>
                                  <Link href={`/dashboard/sessions/${session.id}`}>
                                    <FileText className="h-3 w-3 ml-1" />
                                    כתוב סיכום
                                  </Link>
                                </Button>
                              )}
                              {!isPaid && (
                                <QuickMarkPaid
                                  sessionId={session.id}
                                  clientId={client.id}
                                  clientName={client.name}
                                  amount={Number(session.price)}
                                  creditBalance={Number(client.creditBalance)}
                                  existingPayment={session.payment}
                                  buttonText="סמן כשולם"
                                />
                              )}
                              {hasNote && isPaid && (
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={`/dashboard/sessions/${session.id}`}>
                                    <Eye className="h-3 w-3 ml-1" />
                                    צפה
                                  </Link>
                                </Button>
                              )}
                            </>
                          ) : (
                            // פגישה מבוטלת/לא הגיע
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/dashboard/sessions/${session.id}`}>
                                <Eye className="h-3 w-3 ml-1" />
                                צפה
                              </Link>
                            </Button>
                          )}
                          
                          {/* תפריט נוסף */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/sessions/${session.id}`}>
                                  <FileText className="h-4 w-4 ml-2" />
                                  {hasNote ? "ערוך סיכום" : "כתוב סיכום"}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/calendar?session=${session.id}`}>
                                  <Calendar className="h-4 w-4 ml-2" />
                                  שנה זמן
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

        <TabsContent value="notes" className="mt-6">
          <Tabs defaultValue="summaries" className="w-full">
            <TabsList>
              <TabsTrigger value="summaries">סיכומים</TabsTrigger>
              <TabsTrigger value="diagnosis">אבחון</TabsTrigger>
            </TabsList>

            <TabsContent value="summaries" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>סיכומי טיפול</CardTitle>
                    <CardDescription>
                      {client.therapySessions.filter((s) => s.sessionNote).length} סיכומים
                    </CardDescription>
                  </div>
                  <Button asChild>
                    <Link href={`/dashboard/sessions/new?client=${client.id}`}>
                      <Plus className="ml-2 h-4 w-4" />
                      סיכום חדש
                    </Link>
                  </Button>
                </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חפש בסיכומים..."
                  className="pr-10"
                  id="notes-search"
                />
              </div>

              {client.therapySessions.filter((s) => s.sessionNote).length > 0 ? (
                <div className="space-y-4">
                  {client.therapySessions
                    .filter((s) => s.sessionNote)
                    .map((session) => (
                      <div key={session.id} className="p-4 rounded-lg border">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-medium">
                              {format(
                                new Date(session.startTime),
                                "EEEE, d בMMMM yyyy",
                                { locale: he }
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              פגישה{" "}
                              {session.type === "ONLINE"
                                ? "אונליין"
                                : "פרונטלית"}
                            </p>
                          </div>
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/dashboard/sessions/${session.id}`}
                            >
                              ערוך
                            </Link>
                          </Button>
                        </div>
                        <div className="prose prose-sm max-w-none text-muted-foreground">
                          {session.sessionNote?.content.slice(0, 300)}
                          {(session.sessionNote?.content.length || 0) > 300 &&
                            "..."}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין סיכומי טיפול עדיין</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href={`/dashboard/sessions/new?client=${client.id}`}>
                      כתוב סיכום ראשון
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="diagnosis" className="mt-4">
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
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="questionnaires" className="mt-6">
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
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <Tabs defaultValue="documents" className="w-full">
            <TabsList>
              <TabsTrigger value="documents">מסמכים</TabsTrigger>
              <TabsTrigger value="recordings">הקלטות</TabsTrigger>
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
          </Tabs>
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>היסטוריית תשלומים</CardTitle>
            </CardHeader>
            <CardContent>
              {client.payments.length > 0 ? (
                <div className="space-y-3">
                  {client.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">₪{Number(payment.amount)}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(payment.createdAt), "d/M/yyyy")} •{" "}
                          {payment.method === "CASH"
                            ? "מזומן"
                            : payment.method === "CREDIT_CARD"
                            ? "אשראי"
                            : payment.method === "BANK_TRANSFER"
                            ? "העברה"
                            : "צ׳ק"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          payment.status === "PAID"
                            ? "default"
                            : payment.status === "PENDING"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {payment.status === "PAID"
                          ? "שולם"
                          : payment.status === "PENDING"
                          ? "ממתין"
                          : payment.status === "CANCELLED"
                          ? "בוטל"
                          : "הוחזר"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין תשלומים עדיין</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="mt-6">
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">פרטים אישיים</TabsTrigger>
              <TabsTrigger value="payments">תשלומים</TabsTrigger>
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

            <TabsContent value="payments" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>היסטוריית תשלומים</CardTitle>
                </CardHeader>
                <CardContent>
                  {client.payments.length > 0 ? (
                    <div className="space-y-3">
                      {client.payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                        >
                          <div>
                            <p className="font-medium">₪{Number(payment.amount)}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(payment.createdAt), "d/M/yyyy")} •{" "}
                              {payment.method === "CASH"
                                ? "מזומן"
                                : payment.method === "CREDIT_CARD"
                                ? "אשראי"
                                : payment.method === "BANK_TRANSFER"
                                ? "העברה"
                                : "צ׳ק"}
                            </p>
                          </div>
                          <Badge
                            variant={
                              payment.status === "PAID"
                                ? "default"
                                : payment.status === "PENDING"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {payment.status === "PAID"
                              ? "שולם"
                              : payment.status === "PENDING"
                              ? "ממתין"
                              : payment.status === "CANCELLED"
                              ? "בוטל"
                              : "הוחזר"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CreditCard className="mx-auto h-12 w-12 mb-3 opacity-50" />
                      <p>אין תשלומים עדיין</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}







