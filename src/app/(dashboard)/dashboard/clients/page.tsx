import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Search, Phone, Mail, MoreVertical } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

async function getClients(userId: string) {
  return prisma.client.findMany({
    where: { therapistId: userId },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { therapySessions: true, payments: true },
      },
    },
  });
}

export default async function ClientsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const clients = await getClients(session.user.id);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default">פעיל</Badge>;
      case "INACTIVE":
        return <Badge variant="secondary">לא פעיל</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline">בארכיון</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מטופלים</h1>
          <p className="text-muted-foreground">
            {clients.length} מטופלים במערכת
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/clients/new">
            <Plus className="ml-2 h-4 w-4" />
            מטופל חדש
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="חפש מטופל..." className="pr-10" />
      </div>

      {/* Clients Grid */}
      {clients.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Card key={client.id} className="hover:bg-muted/30 transition-colors">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {getInitials(client.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="font-semibold hover:underline"
                    >
                      {client.name}
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













