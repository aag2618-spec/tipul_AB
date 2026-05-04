import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { ExportAllClientsButton } from "@/components/clients/export-all-clients-button";
import { ConsultationClientsSection } from "@/components/clients/consultation-clients-section";
import { ClientsGridWithSearch } from "@/components/clients/clients-grid-with-search";
import { loadScopeUser, buildClientWhere, isSecretary } from "@/lib/scope";

type ClientStatus = "ACTIVE" | "WAITING" | "ARCHIVED";

async function getClients(
  clientWhere: Prisma.ClientWhereInput,
  status?: ClientStatus
) {
  const statusFilter = status === "ARCHIVED" 
    ? { status: { in: ["ARCHIVED" as const, "INACTIVE" as const] } }
    : status 
      ? { status } 
      : {};

  return prisma.client.findMany({
    where: {
      AND: [
        clientWhere,
        { isQuickClient: false, ...statusFilter },
      ],
    },
    orderBy: { lastName: "asc" },
    include: {
      _count: {
        select: { 
          therapySessions: { where: { type: { not: "BREAK" } } }, 
          payments: true 
        },
      },
    },
  });
}

async function getClientCounts(clientWhere: Prisma.ClientWhereInput) {
  const [active, waiting, inactiveAndArchived, total] = await Promise.all([
    prisma.client.count({ where: { AND: [clientWhere, { status: "ACTIVE", isQuickClient: false }] } }),
    prisma.client.count({ where: { AND: [clientWhere, { status: "WAITING", isQuickClient: false }] } }),
    prisma.client.count({ where: { AND: [clientWhere, { status: { in: ["INACTIVE", "ARCHIVED"] }, isQuickClient: false }] } }),
    prisma.client.count({ where: { AND: [clientWhere, { isQuickClient: false }] } }),
  ]);
  return { active, waiting, archived: inactiveAndArchived, total };
}

const statusConfig: Record<ClientStatus, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
  ACTIVE: { 
    label: "פעילים", 
    bgColor: "bg-emerald-50", 
    textColor: "text-emerald-900 font-semibold", 
    borderColor: "border-emerald-200" 
  },
  WAITING: { 
    label: "ממתינים", 
    bgColor: "bg-amber-50", 
    textColor: "text-amber-900 font-semibold", 
    borderColor: "border-amber-200" 
  },
  ARCHIVED: { 
    label: "ארכיון", 
    bgColor: "bg-slate-50", 
    textColor: "text-slate-900 font-semibold", 
    borderColor: "border-slate-200" 
  },
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const rawStatus = params.status;
  const validStatuses: ClientStatus[] = ["ACTIVE", "WAITING", "ARCHIVED"];
  const mappedStatus = rawStatus === "INACTIVE" ? "ARCHIVED" : rawStatus;
  const activeStatus = validStatuses.includes(mappedStatus as ClientStatus) ? mappedStatus as ClientStatus : undefined;

  const scopeUser = await loadScopeUser(session.user.id);
  const clientWhere = buildClientWhere(scopeUser);
  const asSecretary = isSecretary(scopeUser);

  const [clients, counts, quickClients] = await Promise.all([
    getClients(clientWhere, activeStatus),
    getClientCounts(clientWhere),
    prisma.client.findMany({
      where: { AND: [clientWhere, { isQuickClient: true }] },
      orderBy: { updatedAt: "desc" },
      include: {
        therapySessions: {
          orderBy: { startTime: "desc" },
          select: {
            id: true,
            startTime: true,
            status: true,
            // topic נחשב לתוכן קליני של פגישת ייעוץ (חלק מ-CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.session)
            // — לא טוענים אותו עבור מזכירה.
            ...(asSecretary ? {} : { topic: true }),
            payment: { select: { status: true, amount: true } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מטופלים</h1>
          <p className="text-muted-foreground">
            {counts.total} מטופלים במערכת
          </p>
        </div>
        <div className="flex items-center gap-2">
          {counts.total > 0 && <ExportAllClientsButton />}
          <Button asChild>
            <Link href="/dashboard/clients/new">
              <Plus className="ml-2 h-4 w-4" />
              מטופל חדש
            </Link>
          </Button>
        </div>
      </div>

      {/* Status Filter Tabs - פשוט ונקי */}
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/clients">
          <Badge 
            variant={!activeStatus ? "default" : "outline"}
            className={`cursor-pointer text-sm py-2 px-4 ${!activeStatus ? "" : "hover:bg-muted"}`}
          >
            <Users className="h-3.5 w-3.5 ml-1" />
            הכל ({counts.total})
          </Badge>
        </Link>
        
        <Link href="/dashboard/clients?status=ACTIVE">
          <Badge 
            variant={activeStatus === "ACTIVE" ? "default" : "outline"}
            className={`cursor-pointer text-sm py-2 px-4 ${activeStatus === "ACTIVE" ? "bg-emerald-600" : "hover:bg-muted"}`}
          >
            פעילים ({counts.active})
          </Badge>
        </Link>
        
        <Link href="/dashboard/clients?status=WAITING">
          <Badge 
            variant={activeStatus === "WAITING" ? "default" : "outline"}
            className={`cursor-pointer text-sm py-2 px-4 ${activeStatus === "WAITING" ? "bg-amber-500" : "hover:bg-muted"}`}
          >
            ממתינים ({counts.waiting})
          </Badge>
        </Link>

        <Link href="/dashboard/clients?status=ARCHIVED">
          <Badge
            variant={activeStatus === "ARCHIVED" ? "default" : "outline"}
            className={`cursor-pointer text-sm py-2 px-4 ${activeStatus === "ARCHIVED" ? "bg-slate-500" : "hover:bg-muted"}`}
          >
            ארכיון ({counts.archived})
          </Badge>
        </Link>

        {quickClients.length > 0 && (
          <a
            href="#consultation-section"
            className="inline-flex items-center gap-1.5 cursor-pointer text-sm font-semibold py-2 px-5 rounded-full bg-gradient-to-l from-sky-500 to-sky-600 text-white shadow-sm hover:from-sky-400 hover:to-sky-500 transition-all"
          >
            <Users className="h-3.5 w-3.5" />
            פונים לייעוץ ({quickClients.length})
          </a>
        )}
      </div>

      {/* Current filter indicator */}
      {activeStatus && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${statusConfig[activeStatus].bgColor} ${statusConfig[activeStatus].borderColor} border`}>
          <span className={`font-medium ${statusConfig[activeStatus].textColor}`}>
            מציג: {statusConfig[activeStatus].label} ({clients.length})
          </span>
          <Link href="/dashboard/clients" className={`${statusConfig[activeStatus].textColor} hover:underline mr-auto text-sm`}>
            הצג הכל
          </Link>
        </div>
      )}

      {/* Clients Grid */}
      <ClientsGridWithSearch
        clients={clients.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          email: c.email,
          status: c.status,
          birthDate: c.birthDate ? c.birthDate.toISOString() : null,
          sessionCount: c._count.therapySessions,
        }))}
      />

      {/* סקשן פגישות ייעוץ */}
      {quickClients.length > 0 && (
        <ConsultationClientsSection
          clients={quickClients.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            sessions: c.therapySessions.map((s) => ({
              id: s.id,
              startTime: s.startTime.toISOString(),
              status: s.status,
              topic: s.topic,
              paymentStatus: s.payment?.status || null,
            })),
          }))}
        />
      )}
    </div>
  );
}













