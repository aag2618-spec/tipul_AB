import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FileCheck,
  Stethoscope,
  ArrowRight,
  CalendarClock,
  CalendarCheck,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { shouldScopePersonal } from "@/lib/view-scope";
import { AddCommitmentDialog } from "@/components/clients/add-commitment-dialog";

export const dynamic = "force-dynamic";

const HEALTH_FUND_LABELS: Record<string, string> = {
  CLALIT: "כללית",
  MACCABI: "מכבי",
  MEUHEDET: "מאוחדת",
  LEUMIT: "לאומית",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעילה",
  EXPIRED: "פגה",
  CANCELLED: "בוטלה",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-900 border-emerald-200",
  EXPIRED: "bg-amber-100 text-amber-900 border-amber-200",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-200",
};

function fmt(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("he-IL");
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CommitmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUser(session.user.id);
  const personalOnly = await shouldScopePersonal(scopeUser);
  const clientWhere = buildClientWhere(scopeUser, { personalOnly });

  // אימות הרשאה: ההתחייבות חייבת להשתייך למטופל בתחום הראייה של המשתמש.
  const commitment = await prisma.clientCommitment.findFirst({
    where: { id, client: clientWhere },
    select: {
      id: true,
      status: true,
      commitmentNumber: true,
      form17Number: true,
      referringDoctor: true,
      referralDate: true,
      approvedSessions: true,
      usedSessions: true,
      copaymentAmount: true,
      startDate: true,
      endDate: true,
      notes: true,
      createdAt: true,
      client: {
        select: { id: true, name: true, healthFund: true },
      },
    },
  });

  if (!commitment) notFound();

  const copayment =
    commitment.copaymentAmount != null ? Number(commitment.copaymentAmount) : null;
  const progress =
    commitment.approvedSessions && commitment.approvedSessions > 0
      ? Math.min(100, (commitment.usedSessions / commitment.approvedSessions) * 100)
      : 0;

  // פגישות שנוצלו בפועל כנגד ההתחייבות — שיוך אמיתי (commitmentId על הפגישה),
  // נשלפים שדות אדמיניסטרטיביים בלבד (תאריך) — ללא תוכן קליני.
  const linkedSessions = await prisma.therapySession.findMany({
    where: { commitmentId: commitment.id },
    select: { id: true, startTime: true },
    orderBy: { startTime: "desc" },
  });

  // תאימות לאחור: להתחייבויות ותיקות (מלפני השיוך) אין פגישות מקושרות — אם
  // המונה מצביע על ניצול אך אין שיוך, מציגים קירוב לפי תאריכי התקופה ומבהירים.
  let sessions = linkedSessions;
  let isApprox = false;
  if (linkedSessions.length === 0 && commitment.usedSessions > 0) {
    const startTimeFilter: { gte?: Date; lte?: Date } = {};
    if (commitment.startDate) startTimeFilter.gte = commitment.startDate;
    if (commitment.endDate) startTimeFilter.lte = commitment.endDate;

    sessions = await prisma.therapySession.findMany({
      where: {
        clientId: commitment.client.id,
        status: "COMPLETED",
        ...(startTimeFilter.gte || startTimeFilter.lte
          ? { startTime: startTimeFilter }
          : {}),
      },
      select: { id: true, startTime: true },
      orderBy: { startTime: "desc" },
    });
    isApprox = true;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/dashboard/commitments">
              <ArrowRight className="ml-1 h-4 w-4" />
              חזרה לרשימת ההתחייבויות
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-blue-600" />
            {commitment.client.name}
          </h1>
          <div className="flex items-center gap-2 text-muted-foreground mt-1">
            <Stethoscope className="h-4 w-4" />
            {commitment.client.healthFund
              ? HEALTH_FUND_LABELS[commitment.client.healthFund] ||
                commitment.client.healthFund
              : "ללא קופה"}
            <Badge className={`${STATUS_BADGE[commitment.status] || ""} font-semibold mr-1`}>
              {STATUS_LABELS[commitment.status] || commitment.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddCommitmentDialog clientId={commitment.client.id} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/clients/${commitment.client.id}/edit`}>
              <UserIcon className="ml-1 h-4 w-4" />
              תיק המטופל
            </Link>
          </Button>
        </div>
      </div>

      {/* מצב הניצול */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">מצב הניצול</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {commitment.approvedSessions != null ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">
                  טיפולים: {commitment.usedSessions}/{commitment.approvedSessions}
                </span>
                <span className="text-muted-foreground">
                  {commitment.approvedSessions - commitment.usedSessions > 0
                    ? `נותרו ${commitment.approvedSessions - commitment.usedSessions}`
                    : "הסתיימו"}
                </span>
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              ללא הגבלת מספר טיפולים — בוצעו עד כה {commitment.usedSessions} טיפולים.
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <DetailItem label="השתתפות עצמית">
              {copayment != null ? `₪${copayment}` : "—"}
            </DetailItem>
            <DetailItem label="מספר התחייבות">
              {commitment.commitmentNumber ? (
                <span className="font-mono">{commitment.commitmentNumber}</span>
              ) : (
                "—"
              )}
            </DetailItem>
            <DetailItem label="מספר טופס 17">
              {commitment.form17Number ? (
                <span className="font-mono">{commitment.form17Number}</span>
              ) : (
                "—"
              )}
            </DetailItem>
            <DetailItem label="רופא מפנה">
              {commitment.referringDoctor || "—"}
            </DetailItem>
            <DetailItem label="תאריך הפניה">{fmt(commitment.referralDate) || "—"}</DetailItem>
            <DetailItem label="תקופת תוקף">
              {commitment.startDate || commitment.endDate
                ? `${fmt(commitment.startDate) || "?"} – ${fmt(commitment.endDate) || "?"}`
                : "—"}
            </DetailItem>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
            <CalendarClock className="h-4 w-4" />
            נכנסה למערכת בתאריך {fmtDateTime(commitment.createdAt)}
          </div>

          {commitment.notes && (
            <div className="text-sm pt-2 border-t">
              <span className="text-muted-foreground">הערות: </span>
              {commitment.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* פגישות בתקופת ההתחייבות */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-blue-600" />
            {isApprox ? "פגישות שהושלמו בתקופת ההתחייבות" : "פגישות שנוצלו מההתחייבות"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isApprox && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
              התחייבות זו נוצלה לפני הפעלת השיוך המדויק — הרשימה היא הערכה לפי
              תאריכי התקופה. שיוך מדויק יחל מהפגישות הבאות שיושלמו.
            </p>
          )}
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              עדיין לא נוצלו פגישות מהתחייבות זו.
            </p>
          ) : (
            <>
              <ol className="space-y-1.5">
                {sessions.map((s, idx) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between text-sm border-b last:border-0 py-1.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground tabular-nums w-6 text-left">
                        {sessions.length - idx}.
                      </span>
                      {fmtDateTime(s.startTime)}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      הושלמה
                    </Badge>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground mt-3">
                סה&quot;כ {sessions.length}{" "}
                {isApprox ? "פגישות שהושלמו בתקופה" : "פגישות נוצלו"}
                {commitment.approvedSessions != null &&
                sessions.length !== commitment.usedSessions
                  ? ` (מונה הניצול הרשמי: ${commitment.usedSessions})`
                  : ""}
                .
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
