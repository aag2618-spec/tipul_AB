import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Phone, Mail, MoreVertical, Users } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ExportAllClientsButton } from "@/components/clients/export-all-clients-button";

type ClientStatus = "ACTIVE" | "WAITING" | "INACTIVE" | "ARCHIVED";

async function getClients(userId: string, status?: ClientStatus) {
  return prisma.client.findMany({
    where: { 
      therapistId: userId,
      ...(status && { status }),
    },
    orderBy: { lastName: "asc" },
    include: {
      _count: {
        select: { therapySessions: true, payments: true },
      },
    },
  });
}

async function getClientCounts(userId: string) {
  const [active, waiting, inactive, archived, total] = await Promise.all([
    prisma.client.count({ where: { therapistId: userId, status: "ACTIVE" } }),
    prisma.client.count({ where: { therapistId: userId, status: "WAITING" } }),
    prisma.client.count({ where: { therapistId: userId, status: "INACTIVE" } }),
    prisma.client.count({ where: { therapistId: userId, status: "ARCHIVED" } }),
    prisma.client.count({ where: { therapistId: userId } }),
  ]);
  return { active, waiting, inactive, archived, total };
}

const statusConfig: Record<ClientStatus, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
  ACTIVE: { 
    label: "פעילים", 
    bgColor: "bg-emerald-100", 
    textColor: "text-emerald-700", 
    borderColor: "border-emerald-300" 
  },
  WAITING: { 
    label: "ממתינים", 
    bgColor: "bg-amber-100", 
    textColor: "text-amber-700", 
    borderColor: "border-amber-300" 
  },
  INACTIVE: { 
    label: "לא פעילים", 
    bgColor: "bg-slate-100", 
    textColor: "text-slate-700", 
    borderColor: "border-slate-300" 
  },
  ARCHIVED: { 
    label: "ארכיון", 
    bgColor: "bg-purple-100", 
    textColor: "text-purple-700", 
    borderColor: "border-purple-300" 
  },
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const statusFilter = params.status as ClientStatus | undefined;
  const validStatuses: ClientStatus[] = ["ACTIVE", "WAITING", "INACTIVE", "ARCHIVED"];
  const activeStatus = validStatuses.includes(statusFilter as ClientStatus) ? statusFilter : undefined;

  const [clients, counts] = await Promise.all([
    getClients(session.user.id, activeStatus),
    getClientCounts(session.user.id),
  ]);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">פעיל</Badge>;
      case "WAITING":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200">ממתין</Badge>;
      case "INACTIVE":
        return <Badge variant="secondary">לא פעיל</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline">בארכיון</Badge>;
      default:
        return null;
    }
  };

  const getStatusTitle = () => {
    if (!activeStatus) return "כל המטופלים";
    return statusConfig[activeStatus].label;
  };

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

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/clients">
          <Badge 
            variant={!activeStatus ? "default" : "outline"}
            className={`cursor-pointer text-sm py-1.5 px-3 ${!activeStatus ? "" : "hover:bg-muted"}`}
          >
            <Users className="h-3.5 w-3.5 ml-1" />
            הכל ({counts.total})
          </Badge>
        </Link>
        {(Object.keys(statusConfig) as ClientStatus[]).map((status) => {
          const config = statusConfig[status];
          const count = status === "ACTIVE" ? counts.active 
            : status === "WAITING" ? counts.waiting 
            : status === "INACTIVE" ? counts.inactive 
            : counts.archived;
          const isActive = activeStatus === status;
          
          return (
            <Link key={status} href={`/dashboard/clients?status=${status}`}>
              <Badge 
                className={`cursor-pointer text-sm py-1.5 px-3 transition-colors ${
                  isActive 
                    ? `${config.bgColor} ${config.textColor} ${config.borderColor} border` 
                    : `${config.bgColor}/50 ${config.textColor} hover:${config.bgColor}`
                }`}
              >
                {config.label} ({count})
              </Badge>
            </Link>
          );
        })}
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
      {clients.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Card key={client.id} className="hover:bg-muted/30 transition-colors">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {getInitials(client.firstName, client.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="font-semibold hover:underline"
                    >
                      {client.firstName} {client.lastName}
                    </Link>
                    <div className="mt-1">{getStatusBadge(client.status)}</div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/clients/${client.id}`}>
                        צפה בתיק
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/clients/${client.id}/edit`}>
                        ערוך פרטים
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/calendar?client=${client.id}`}>
                        קבע פגישה
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-1.5 text-sm">
                  {client.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span dir="ltr">{client.phone}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span dir="ltr" className="truncate">{client.email}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-sm text-muted-foreground">
                  <span>{client._count.therapySessions} פגישות</span>
                  <span>
                    {client.birthDate
                      ? format(new Date(client.birthDate), "dd/MM/yyyy")
                      : "ללא תאריך לידה"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="mb-2">אין מטופלים עדיין</CardTitle>
            <CardDescription className="mb-4">
              הוסף את המטופל הראשון שלך כדי להתחיל
            </CardDescription>
            <Button asChild>
              <Link href="/dashboard/clients/new">
                <Plus className="ml-2 h-4 w-4" />
                הוסף מטופל
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}













