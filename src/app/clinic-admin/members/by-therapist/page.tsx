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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
  ChevronsUpDown,
  ChevronsDownUp,
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
  // בורר מטפל: "all" = כל המטפלים, אחרת מזהה מטפל ספציפי.
  const [therapistFilter, setTherapistFilter] = useState<string>("all");
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
    return therapists
      // בורר מטפל: כשנבחר מטפל ספציפי — מציגים רק אותו.
      .filter((t) => therapistFilter === "all" || t.id === therapistFilter)
      .map((t) => {
        if (!normalizedQuery) return t;
        // אם שם המטפל תואם לחיפוש — מציגים את כל המטופלים שלו (לא מסננים).
        if (therapistDisplayName(t).toLowerCase().includes(normalizedQuery)) {
          return t;
        }
        // אחרת — סינון פר-מטופל (שם/טלפון/אימייל).
        return {
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
        };
      })
      .filter((t) => {
        // מטפל שנבחר מפורשות בבורר — תמיד מוצג (גם בלי מטופלים תואמים).
        if (therapistFilter !== "all") return true;
        // ללא חיפוש — כל המטפלים מוצגים, כדי שבעלים יראה גם מטפל פנוי.
        if (!normalizedQuery) return true;
        // עם חיפוש — מציגים מטפל שהשם שלו תואם, או שיש לו מטופלים תואמים.
        return (
          therapistDisplayName(t).toLowerCase().includes(normalizedQuery) ||
          t.clients.length > 0
        );
      });
  }, [therapists, normalizedQuery, therapistFilter]);

  const totalClients = therapists.reduce((sum, t) => sum + t.clients.length, 0);

  // האם כל המטפלים המוצגים פתוחים — קובע אם הכפתור פותח או סוגר את הכל.
  const allOpen =
    filtered.length > 0 && filtered.every((t) => openIds[t.id] ?? true);

  function toggleOpen(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll(open: boolean) {
    // פועל רק על המטפלים המוצגים (filtered), בעקביות עם חישוב allOpen —
    // כדי לא לדרוס בשוגג את מצב הכרטיסים שמוסתרים ע"י חיפוש/בורר מטפל.
    setOpenIds((prev) => {
      const next = { ...prev };
      for (const t of filtered) next[t.id] = open;
      return next;
    });
  }

  function selectTherapist(value: string) {
    setTherapistFilter(value);
    // בחירת מטפל ספציפי → פותחים אותו אוטומטית כדי לראות מיד את המטופלים.
    if (value !== "all") {
      setOpenIds((prev) => ({ ...prev, [value]: true }));
    }
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => expandAll(!allOpen)}
          >
            {allOpen ? (
              <>
                <ChevronsDownUp className="ml-2 h-4 w-4" />
                סגור הכל
              </>
            ) : (
              <>
                <ChevronsUpDown className="ml-2 h-4 w-4" />
                פתח הכל
              </>
            )}
          </Button>
          <Button asChild size="sm">
            <Link href="/clinic-admin/transfer">
              <ArrowLeftRight className="ml-2 h-4 w-4" />
              העברת מטופל
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי מטופל או מטפל (שם/טלפון/אימייל)..."
            className="pr-9"
          />
        </div>
        {therapists.length > 1 && (
          <Select value={therapistFilter} onValueChange={selectTherapist}>
            <SelectTrigger className="w-full sm:w-60">
              <SelectValue placeholder="בחר מטפל" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המטפלים</SelectItem>
              {therapists.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {therapistDisplayName(t)} ({t.clients.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {normalizedQuery || therapistFilter !== "all"
              ? "לא נמצאו תוצאות תואמות"
              : "אין מטפלים פעילים בקליניקה"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
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
                <Card className="py-0 gap-0 overflow-hidden">
                  <CardHeader className="p-0">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full text-right flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
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
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-0">
                      {t.clients.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3 text-center">
                          אין מטופלים פעילים אצל מטפל/ת זה/זו
                        </p>
                      ) : (
                        <div className="border border-border rounded-lg overflow-hidden">
                          {t.clients.map((c, idx) => (
                            <Link
                              key={c.id}
                              href={`/dashboard/clients/${c.id}`}
                              className={`block px-4 py-2 hover:bg-muted transition-colors ${
                                idx !== t.clients.length - 1
                                  ? "border-b border-border"
                                  : ""
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-medium text-sm truncate">
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
