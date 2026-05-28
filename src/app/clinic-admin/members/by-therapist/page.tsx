"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Users,
  Loader2,
  Crown,
  Stethoscope,
  Search,
  ChevronDown,
  ChevronLeft,
  ArrowLeftRight,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type ClinicRole = "OWNER" | "THERAPIST" | "SECRETARY";

interface ClientRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  isQuickClient: boolean;
  _count: { therapySessions: number };
}

interface TherapistWithClients {
  id: string;
  name: string | null;
  email: string;
  clinicRole: ClinicRole | null;
  clients: ClientRow[];
}

function clientDisplayName(c: ClientRow): string {
  const parts = [c.firstName, c.lastName]
    .filter((s): s is string => Boolean(s))
    .join(" ")
    .trim();
  return parts || c.name || "ללא שם";
}

function therapistDisplayName(t: TherapistWithClients): string {
  return t.name?.trim() || t.email;
}

export default function ClientsByTherapistPage() {
  const [therapists, setTherapists] = useState<TherapistWithClients[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // open per-therapist; ברירת מחדל פתוח כדי שבעלים יראה הכל בלי קליק נוסף.
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/clinic-admin/clients-by-therapist", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) toast.error("שגיאה בטעינת הנתונים");
          return;
        }
        const data = (await res.json()) as TherapistWithClients[];
        if (cancelled) return;
        setTherapists(data);
        // initialize all open
        const initOpen: Record<string, boolean> = {};
        for (const t of data) initOpen[t.id] = true;
        setOpenIds(initOpen);
      } catch {
        if (!cancelled) toast.error("שגיאה ברשת");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return therapists;
    // סינון פר-לקוח (שם/טלפון/אימייל). מטפל בלי לקוחות שעוברים את הפילטר —
    // לא יוצג כשיש חיפוש פעיל (אחרת התוצאה רועשת). ללא חיפוש — כל המטפלים
    // מוצגים גם בלי לקוחות, כי בעלים רוצה לראות שיש מטפל פנוי.
    return therapists
      .map((t) => ({
        ...t,
        clients: t.clients.filter((c) => {
          const name = clientDisplayName(c).toLowerCase();
          const phone = (c.phone || "").toLowerCase();
          const email = (c.email || "").toLowerCase();
          return (
            name.includes(normalizedQuery) ||
            phone.includes(normalizedQuery) ||
            email.includes(normalizedQuery)
          );
        }),
      }))
      .filter((t) => t.clients.length > 0);
  }, [therapists, normalizedQuery]);

  const totalClients = therapists.reduce((sum, t) => sum + t.clients.length, 0);

  function toggleOpen(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const t of therapists) next[t.id] = open;
    setOpenIds(next);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מטופלים לפי מטפל</h1>
            <p className="text-sm text-muted-foreground">
              {therapists.length} מטפלים · {totalClients} מטופלים פעילים
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => expandAll(true)}>
            פתח/י הכל
          </Button>
          <Button variant="outline" size="sm" onClick={() => expandAll(false)}>
            סגור/י הכל
          </Button>
          <Button asChild size="sm">
            <Link href="/clinic-admin/transfer">
              <ArrowLeftRight className="ml-2 h-4 w-4" />
              העברת מטופל
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש מטופל לפי שם/טלפון/אימייל..."
          className="pr-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {normalizedQuery
              ? "לא נמצאו מטופלים תואמים את החיפוש"
              : "אין מטפלים פעילים בקליניקה"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const isOpen = openIds[t.id] ?? true;
            const Icon = t.clinicRole === "OWNER" ? Crown : Stethoscope;
            const iconColor =
              t.clinicRole === "OWNER" ? "text-amber-400" : "text-blue-400";
            return (
              <Collapsible
                key={t.id}
                open={isOpen}
                onOpenChange={() => toggleOpen(t.id)}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full text-right flex items-center justify-between gap-3"
                      >
                        <CardTitle className="text-base flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${iconColor}`} />
                          {therapistDisplayName(t)}
                          {t.clinicRole === "OWNER" && (
                            <Badge className="bg-amber-500/20 text-amber-400">
                              בעלים
                            </Badge>
                          )}
                          <span className="text-muted-foreground font-normal">
                            ({t.clients.length})
                          </span>
                        </CardTitle>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                      {t.clients.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          אין מטופלים פעילים אצל מטפל/ת זה/זו
                        </p>
                      ) : (
                        <div className="border border-border rounded-lg overflow-hidden">
                          {t.clients.map((c, idx) => (
                            <Link
                              key={c.id}
                              href={`/dashboard/clients/${c.id}`}
                              className={`block px-4 py-3 hover:bg-muted transition-colors ${
                                idx !== t.clients.length - 1
                                  ? "border-b border-border"
                                  : ""
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-medium truncate">
                                    {clientDisplayName(c)}
                                  </span>
                                  {c.isQuickClient && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      <Zap className="ml-1 h-3 w-3" />
                                      מהיר
                                    </Badge>
                                  )}
                                  {c.status === "WAITING" && (
                                    <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                                      ממתין/ה
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {c.phone && (
                                    <span dir="ltr">{c.phone}</span>
                                  )}
                                  <span>
                                    {c._count.therapySessions} פגישות
                                  </span>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
