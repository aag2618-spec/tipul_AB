import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FileCheck } from "lucide-react";
import {
  loadScopeUser,
  buildClientWhere,
  isClinicOwner,
  isSecretary,
} from "@/lib/scope";
import { shouldScopePersonal } from "@/lib/view-scope";
import {
  CommitmentsBrowser,
  type CommitmentListItem,
} from "@/components/clients/commitments-browser";
import type { ClientPickerItem } from "@/components/clients/add-commitment-picker-dialog";

export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUser(session.user.id);
  const personalOnly = await shouldScopePersonal(scopeUser);
  const clientWhere = buildClientWhere(scopeUser, { personalOnly });

  const [commitments, clientsRaw] = await Promise.all([
    prisma.clientCommitment.findMany({
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
            therapist: { select: { name: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.client.findMany({
      where: { AND: [clientWhere, { isQuickClient: false }] },
      select: {
        id: true,
        name: true,
        therapistId: true,
        therapist: { select: { name: true } },
      },
      orderBy: { lastName: "asc" },
    }),
  ]);

  // האם להציג שיוך מטפל/ת — רק כשהצופה רואה מטופלים של כמה מטפלים (בעלים/מזכירה
  // בתצוגת קליניקה) ובפועל יש יותר ממטפל/ת אחד/ת. מטפל/ת עצמאי/ת או תצוגה אישית
  // → false (כל המטופלים שלו/ה, אין מה להפריד).
  const canSeeOthers =
    (isClinicOwner(scopeUser) || isSecretary(scopeUser)) && !personalOnly;
  const distinctTherapists = new Set(clientsRaw.map((c) => c.therapistId)).size;
  const showTherapist = canSeeOthers && distinctTherapists > 1;

  const items: CommitmentListItem[] = commitments.map((c) => ({
    id: c.id,
    status: c.status,
    approvedSessions: c.approvedSessions,
    usedSessions: c.usedSessions,
    copaymentAmount: c.copaymentAmount != null ? Number(c.copaymentAmount) : null,
    startDate: c.startDate ? c.startDate.toISOString() : null,
    endDate: c.endDate ? c.endDate.toISOString() : null,
    commitmentNumber: c.commitmentNumber,
    therapistName: c.client.therapist?.name ?? null,
    client: { id: c.client.id, name: c.client.name, healthFund: c.client.healthFund },
  }));

  const clients: ClientPickerItem[] = clientsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    therapistName: c.therapist?.name ?? null,
  }));

  const activeCount = items.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileCheck className="h-6 w-6 text-blue-600" />
          התחייבויות קופ&quot;ח
        </h1>
        <p className="text-muted-foreground">
          {items.length} התחייבויות סה&quot;כ — {activeCount} פעילות
        </p>
      </div>

      <CommitmentsBrowser
        commitments={items}
        clients={clients}
        showTherapist={showTherapist}
      />
    </div>
  );
}
