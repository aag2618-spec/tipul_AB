"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Phone, Mail, Plus, Search, Stethoscope, FileCheck, Users } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { getTherapistAccent } from "@/lib/calendar/event-colors";

interface ClientGridItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  birthDate: string | null;
  sessionCount: number;
  healthFund: string | null;
  activeCommitment: {
    approvedSessions: number | null;
    usedSessions: number;
    copaymentAmount: number | null;
  } | null;
  // דף רב-מטפלים: המטפל/ת האחראי/ת — לסינון וצבע.
  therapistId: string | null;
  therapistName: string | null;
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

  // דף רב-מטפלים: מסנן לפי מטפל + צבע, בדומה ליומן. הרשימה נטענת מ-
  // /api/clinic/therapists (זמין לבעלים/מזכירה; נכשל בשקט לאחרים → אין מסנן).
  const { data: authSession } = useSession();
  const currentTherapistId = authSession?.user?.id ?? null;
  const [therapists, setTherapists] = useState<{ id: string; name: string | null }[]>([]);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/clinic/therapists")
      .then(async (res) => {
        if (res.ok && active) {
          const data = await res.json();
          setTherapists(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        // מטפל עצמאי / שגיאה — אין מסנן, וזה תקין
      });
    return () => {
      active = false;
    };
  }, []);

  const multiTherapist = therapists.length > 1;
  const allTherapistIds = therapists.map((t) => t.id);
  const isTherapistSelected = (id: string) =>
    !selectedTherapistIds || selectedTherapistIds.has(id);
  const selectedTherapistCount = selectedTherapistIds
    ? selectedTherapistIds.size
    : therapists.length;
  const toggleTherapist = (id: string) => {
    setSelectedTherapistIds((prev) => {
      const base = prev ? new Set(prev) : new Set(allTherapistIds);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base.size === allTherapistIds.length ? null : base;
    });
  };
  const showAllTherapists = () => setSelectedTherapistIds(null);

  const filtered = clients.filter((c) => {
    // סינון לפי מטפל (רק בקליניקה רב-מטפלית). מטופל ללא מטפל נשאר מוצג.
    if (
      multiTherapist &&
      selectedTherapistIds &&
      c.therapistId &&
      !selectedTherapistIds.has(c.therapistId)
    ) {
      return false;
    }
    if (search.trim()) {
      const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
      if (!fullName.includes(search.trim())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* חיפוש + מסנן מטפל */}
      {clients.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          {multiTherapist && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 whitespace-nowrap">
                  <Users className="h-4 w-4" />
                  מטפלים ({selectedTherapistCount}/{therapists.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>סינון לפי מטפל</DropdownMenuLabel>
                <DropdownMenuItem onClick={showAllTherapists}>הצג את כולם</DropdownMenuItem>
                <DropdownMenuSeparator />
                {therapists.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={isTherapistSelected(t.id)}
                    onCheckedChange={() => toggleTherapist(t.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getTherapistAccent(t.id) }}
                        aria-hidden
                      />
                      {t.name || "מטפל"}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
                      {/* דף רב-מטפלים: מטפל/ת אחראי/ת — רק של מטפלים אחרים (לא שלי). */}
                      {multiTherapist &&
                        client.therapistId &&
                        client.therapistId !== currentTherapistId &&
                        client.therapistName && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: getTherapistAccent(client.therapistId) }}
                              aria-hidden
                            />
                            <span className="truncate">{client.therapistName}</span>
                          </div>
                        )}
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
                    {client.healthFund && (
                      <span className="flex items-center gap-1">
                        <Stethoscope className="h-3 w-3" />
                        {{ CLALIT: "כללית", MACCABI: "מכבי", MEUHEDET: "מאוחדת", LEUMIT: "לאומית" }[client.healthFund] || client.healthFund}
                      </span>
                    )}
                    <span>
                      {client.birthDate
                        ? format(new Date(client.birthDate), "dd/MM/yyyy")
                        : "ללא תאריך לידה"}
                    </span>
                  </div>
                  {client.activeCommitment && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-200">
                      <FileCheck className="h-3 w-3 text-blue-700 shrink-0" />
                      <span className="text-xs text-blue-800 font-medium">
                        התחייבות פעילה
                        {client.activeCommitment.approvedSessions != null && (
                          <span className="mx-1">
                            ({client.activeCommitment.usedSessions}/{client.activeCommitment.approvedSessions})
                          </span>
                        )}
                        {client.activeCommitment.copaymentAmount != null && (
                          <span className="mx-1">• ₪{client.activeCommitment.copaymentAmount}</span>
                        )}
                      </span>
                    </div>
                  )}
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
