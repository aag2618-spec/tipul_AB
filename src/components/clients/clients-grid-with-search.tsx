"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, Mail, Plus, Search } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface ClientGridItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  birthDate: string | null;
  sessionCount: number;
}

interface ClientsGridWithSearchProps {
  clients: ClientGridItem[];
}

const getInitials = (firstName: string | null, lastName: string | null) => {
  const first = firstName || "";
  const last = lastName || "";
  return `${first[0] || ""}${last[0] || ""}`;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "ACTIVE":
      return <Badge className="bg-emerald-50 text-emerald-900 font-semibold hover:bg-emerald-100 border border-emerald-200">פעיל</Badge>;
    case "WAITING":
      return <Badge className="bg-amber-50 text-amber-900 font-semibold hover:bg-amber-100 border border-amber-200">ממתין</Badge>;
    case "INACTIVE":
    case "ARCHIVED":
      return <Badge className="bg-slate-50 text-slate-900 font-semibold hover:bg-slate-100 border border-slate-200">ארכיון</Badge>;
    default:
      return null;
  }
};

export function ClientsGridWithSearch({ clients }: ClientsGridWithSearchProps) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? clients.filter((c) => {
        const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
        return fullName.includes(search.trim());
      })
    : clients;

  return (
    <div className="space-y-4">
      {/* חיפוש */}
      {clients.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
      )}

      {/* גריד מטופלים */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <Link key={client.id} href={`/dashboard/clients/${client.id}`}>
              <Card className="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getInitials(client.firstName, client.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-base">
                        {client.firstName} {client.lastName}
                      </h3>
                      <div className="mt-1">{getStatusBadge(client.status)}</div>
                    </div>
                  </div>
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
                    <span>{client.sessionCount} פגישות</span>
                    <span>
                      {client.birthDate
                        ? format(new Date(client.birthDate), "dd/MM/yyyy")
                        : "ללא תאריך לידה"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : clients.length > 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">לא נמצאו מטופלים</p>
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
