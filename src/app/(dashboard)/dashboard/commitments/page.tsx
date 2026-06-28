import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileCheck, Users, Plus } from "lucide-react";
import Link from "next/link";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { shouldScopePersonal } from "@/lib/view-scope";
import {
  CommitmentsBrowser,
  type CommitmentListItem,
} from "@/components/clients/commitments-browser";

export const dynamic = "force-dynamic";

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

  const items: CommitmentListItem[] = commitments.map((c) => ({
    id: c.id,
    status: c.status,
    approvedSessions: c.approvedSessions,
    usedSessions: c.usedSessions,
    copaymentAmount: c.copaymentAmount != null ? Number(c.copaymentAmount) : null,
    startDate: c.startDate ? c.startDate.toISOString() : null,
    endDate: c.endDate ? c.endDate.toISOString() : null,
    commitmentNumber: c.commitmentNumber,
    client: c.client,
  }));

  const activeCount = items.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-blue-600" />
            התחייבויות קופ&quot;ח
          </h1>
          <p className="text-muted-foreground">
            {items.length} התחייבויות סה&quot;כ — {activeCount} פעילות
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/clients">
            <Users className="ml-2 h-4 w-4" />
            כל המטופלים
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
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
        <CommitmentsBrowser commitments={items} />
      )}
    </div>
  );
}
