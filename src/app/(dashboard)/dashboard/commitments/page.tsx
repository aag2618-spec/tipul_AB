import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileCheck, Stethoscope, Users, Plus } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { shouldScopePersonal } from "@/lib/view-scope";

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

export default async function CommitmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUser(session.user.id);
  const personalOnly = await shouldScopePersonal(scopeUser);
  const clientWhere = buildClientWhere(scopeUser, { personalOnly });

  const commitments = await prisma.clientCommitment.findMany({
    where: { client: clientWhere },
    select: {
      id: true,
      status: true,
      approvedSessions: true,
      usedSessions: true,
      copaymentAmount: true,
      startDate: true,
      endDate: true,
      commitmentNumber: true,
      client: {
        select: {
          id: true,
          name: true,
          healthFund: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const active = commitments.filter((c) => c.status === "ACTIVE");
  const expired = commitments.filter((c) => c.status === "EXPIRED");
  const cancelled = commitments.filter((c) => c.status === "CANCELLED");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-blue-600" />
            התחייבויות קופ"ח
          </h1>
          <p className="text-muted-foreground">
            {commitments.length} התחייבויות סה"כ — {active.length} פעילות
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/clients">
            <Users className="ml-2 h-4 w-4" />
            כל המטופלים
          </Link>
        </Button>
      </div>

      {commitments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">אין התחייבויות עדיין</h3>
            <p className="text-sm text-muted-foreground mb-4">
              ניתן להוסיף התחייבות קופת חולים מתוך תיק מטופל
            </p>
            <Button asChild>
              <Link href="/dashboard/clients">
                <Plus className="ml-2 h-4 w-4" />
                לרשימת מטופלים
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">פעילות ({active.length})</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {active.map((c) => (
                  <CommitmentCard key={c.id} commitment={c} />
                ))}
              </div>
            </section>
          )}

          {expired.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">פגות תוקף ({expired.length})</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {expired.map((c) => (
                  <CommitmentCard key={c.id} commitment={c} />
                ))}
              </div>
            </section>
          )}

          {cancelled.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">בוטלו ({cancelled.length})</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {cancelled.map((c) => (
                  <CommitmentCard key={c.id} commitment={c} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

interface CommitmentData {
  id: string;
  status: string;
  approvedSessions: number | null;
  usedSessions: number;
  copaymentAmount: { toString: () => string } | null;
  startDate: Date | null;
  endDate: Date | null;
  commitmentNumber: string | null;
  client: {
    id: string;
    name: string;
    healthFund: string | null;
  };
}

function CommitmentCard({ commitment: c }: { commitment: CommitmentData }) {
  const copayment = c.copaymentAmount != null ? Number(c.copaymentAmount) : null;
  const progress = c.approvedSessions && c.approvedSessions > 0
    ? Math.min(100, (c.usedSessions / c.approvedSessions) * 100)
    : 0;

  return (
    <Link href={`/dashboard/clients/${c.client.id}`}>
      <Card className="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer h-full">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-base">{c.client.name}</h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                <Stethoscope className="h-3.5 w-3.5" />
                {c.client.healthFund
                  ? HEALTH_FUND_LABELS[c.client.healthFund] || c.client.healthFund
                  : "ללא קופה"}
              </div>
            </div>
            <Badge className={`${STATUS_BADGE[c.status] || ""} font-semibold`}>
              {STATUS_LABELS[c.status] || c.status}
            </Badge>
          </div>

          {c.commitmentNumber && (
            <div className="text-xs text-muted-foreground">
              מס' התחייבות: <span className="font-mono">{c.commitmentNumber}</span>
            </div>
          )}

          {c.approvedSessions != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">טיפולים</span>
                <span className="font-semibold">
                  {c.usedSessions}/{c.approvedSessions}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm pt-2 border-t">
            {copayment != null ? (
              <span className="font-semibold text-blue-700">
                השתתפות עצמית: ₪{copayment}
              </span>
            ) : (
              <span className="text-muted-foreground">לא נקבעה השתתפות עצמית</span>
            )}
            {c.endDate && (
              <span className="text-xs text-muted-foreground">
                עד {format(new Date(c.endDate), "dd/MM/yyyy")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
