"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, User, CalendarPlus, CalendarClock, Loader2 } from "lucide-react";
import { ContactActions } from "@/components/contact-actions";
import { ClientSessionsDialog } from "@/components/clients/client-sessions-dialog";

interface ClientLite {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

const MAX_RESULTS = 8;

/**
 * חיפוש מהיר גלובלי (Ctrl+K / ⌘K) — מטופל מתקשר → מקלידים שם או טלפון → קופצים
 * לכרטיס / קובעים פגישה / יוצרים קשר (SMS/אימייל). נטען עצלן בפתיחה הראשונה (כל
 * המטופלים ב-scope, /api/clients מסנן לפי הרשאות). מידע אדמיניסטרטיבי בלבד
 * (שם + טלפון + אימייל).
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // טעינה עצלנית של רשימת המטופלים בפתיחה הראשונה (cache ל-session). ה-setState
  // נעשה רק ב-callbacks של ה-fetch (לא סינכרונית ב-effect).
  const loadClients = useCallback(() => {
    setLoading(true);
    fetch("/api/clients?includeQuick=true", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setClients(
          Array.isArray(data)
            ? data.map((c: ClientLite) => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
                email: c.email,
              }))
            : [],
        );
        setLoaded(true);
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false));
  }, []);

  // פתיחה/סגירה — מאפס שאילתה ובחירה בפתיחה וטוען מטופלים פעם ראשונה. event
  // handler (לא effect) כדי לא להפעיל setState סינכרונית בתוך effect.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setQuery("");
        setActiveIndex(0);
        if (!loaded) loadClients();
      }
    },
    [loaded, loadClients],
  );

  // קיצור מקלדת גלובלי: Ctrl+K / ⌘K לפתיחה/סגירה.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleOpenChange]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const digits = q.replace(/\D/g, "");
    return clients
      .filter((c) => {
        const byName = c.name?.includes(q);
        const byPhone =
          digits.length >= 2 &&
          (c.phone || "").replace(/\D/g, "").includes(digits);
        return byName || byPhone;
      })
      .slice(0, MAX_RESULTS);
  }, [query, clients]);

  const openClient = useCallback(
    (id: string) => {
      setOpen(false);
      router.push(`/dashboard/clients/${id}`);
    },
    [router],
  );

  const bookForClient = useCallback(
    (id: string) => {
      setOpen(false);
      // ?client=ID מסמן את המטופל; לחיצה על משבצת ביומן תפתח פגישה עבורו.
      router.push(`/dashboard/calendar?client=${id}`);
    },
    [router],
  );

  // דיאלוג "כל הפגישות" — נפתח מהחיפוש (סוגר את החיפוש כדי לא לקנן דיאלוגים).
  const [sessionsDialog, setSessionsDialog] = useState<{
    open: boolean;
    clientId: string | null;
    clientName: string;
  }>({ open: false, clientId: null, clientName: "" });

  const viewSessions = useCallback((id: string, name: string) => {
    setOpen(false);
    setSessionsDialog({ open: true, clientId: id, clientName: name });
  }, []);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) openClient(target.id);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        className="gap-2 text-muted-foreground"
        aria-label="חיפוש מהיר"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">חיפוש מהיר</span>
        <kbd className="hidden md:inline pointer-events-none select-none rounded border bg-muted px-1.5 text-[10px] font-medium">
          Ctrl K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-lg p-0 gap-0 overflow-hidden top-[20%] translate-y-0"
          dir="rtl"
        >
          <DialogTitle className="sr-only">חיפוש מהיר</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="חיפוש מטופל לפי שם או טלפון…"
              className="border-0 focus-visible:ring-0 shadow-none px-1 h-12"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto p-1.5">
            {loading && !loaded ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : query.trim() === "" ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                התחילו להקליד שם מטופל או טלפון…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                לא נמצאו מטופלים תואמים
              </div>
            ) : (
              results.map((c, idx) => (
                <div
                  key={c.id}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => openClient(c.id)}
                  className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 cursor-pointer ${
                    idx === activeIndex ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                      <User className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      {c.phone && (
                        <span dir="ltr" className="text-xs text-muted-foreground truncate">
                          {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ContactActions
                      clientId={c.id}
                      clientName={c.name}
                      phone={c.phone}
                      email={c.email}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      title="כל הפגישות וביטול"
                      aria-label="כל הפגישות וביטול"
                      onClick={(e) => {
                        e.stopPropagation();
                        viewSessions(c.id, c.name);
                      }}
                    >
                      <CalendarClock className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      title="קבע פגישה"
                      aria-label="קבע פגישה"
                      onClick={(e) => {
                        e.stopPropagation();
                        bookForClient(c.id);
                      }}
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ClientSessionsDialog
        open={sessionsDialog.open}
        onOpenChange={(o) =>
          setSessionsDialog((prev) => ({ ...prev, open: o }))
        }
        clientId={sessionsDialog.clientId}
        clientName={sessionsDialog.clientName}
      />
    </>
  );
}
