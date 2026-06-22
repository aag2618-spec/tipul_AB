"use client";

// פעולות מהירות בדשבורד המזכירה — פעולות *אמיתיות* שחוסכות עבודה (לא קישורי
// ניווט שכבר קיימים בתפריט הצד):
//   1. שליחת תזכורות לפגישות מחר/בעוד יומיים, בבחירה פרטנית.
//   2. שליחת קישור זימון-עצמי אישי למטופלים (בשם המטפל של כל מטופל).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  BellRing,
  Loader2,
  Send,
  CheckCircle2,
  Link2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useShabbat } from "@/hooks/useShabbat";

export type QuickActionSession = {
  id: string;
  time: string;
  clientName: string;
  therapistName: string;
  reminderSent: boolean;
  hasContact: boolean;
};

interface SecretaryQuickActionsProps {
  tomorrowLabel: string;
  dayAfterLabel: string;
  tomorrowSessions: QuickActionSession[];
  dayAfterSessions: QuickActionSession[];
  canSendReminders: boolean;
}

type DayKey = "tomorrow" | "dayAfter";

export function SecretaryQuickActions({
  tomorrowLabel,
  dayAfterLabel,
  tomorrowSessions,
  dayAfterSessions,
  canSendReminders,
}: SecretaryQuickActionsProps) {
  const { isShabbat, tooltip } = useShabbat();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeDay, setActiveDay] = useState<DayKey>("tomorrow");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // ── דיאלוג שליחת קישור זימון עצמי ──
  const [bookingOpen, setBookingOpen] = useState(false);
  const [clients, setClients] = useState<
    { id: string; name: string; hasContact: boolean }[]
  >([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sendingLinks, setSendingLinks] = useState(false);

  const sessionsByDay: Record<DayKey, QuickActionSession[]> = {
    tomorrow: tomorrowSessions,
    dayAfter: dayAfterSessions,
  };

  // ברירת מחדל לסימון: פגישות עם פרטי קשר שעדיין לא נשלחה להן תזכורת.
  const eligibleIds = (list: QuickActionSession[]) =>
    list.filter((s) => s.hasContact && !s.reminderSent).map((s) => s.id);

  // ממתינות לתזכורת בשני הימים (מחר + בעוד יומיים) — כדי שהכרטיס לא יציג
  // "הכל מעודכן" כשיש עבודה בלשונית השנייה.
  const pendingCount =
    eligibleIds(tomorrowSessions).length + eligibleIds(dayAfterSessions).length;

  function selectDefaultsFor(day: DayKey) {
    setSelectedIds(new Set(eligibleIds(sessionsByDay[day])));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setActiveDay("tomorrow");
      selectDefaultsFor("tomorrow");
    }
  }

  function handleDayChange(day: string) {
    const d = day as DayKey;
    setActiveDay(d);
    selectDefaultsFor(d);
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeSessions = sessionsByDay[activeDay];
  const selectedCount = activeSessions.filter((s) => selectedIds.has(s.id)).length;

  async function handleSend() {
    const ids = activeSessions
      .filter((s) => selectedIds.has(s.id))
      .map((s) => s.id);
    if (ids.length === 0) return;
    setSending(true);
    try {
      const res = await fetch("/api/sessions/send-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || "שגיאה בשליחת התזכורות");
        return;
      }
      const parts: string[] = [];
      if (data.sent) parts.push(`${data.sent} נשלחו`);
      if (data.alreadySent) parts.push(`${data.alreadySent} כבר נשלחו קודם`);
      if (data.disabled) parts.push(`${data.disabled} עם תזכורות כבויות אצל המטפל`);
      if (data.noContact) parts.push(`${data.noContact} ללא פרטי קשר`);
      if (data.failed) parts.push(`${data.failed} נכשלו`);
      const summary = parts.join(" · ");
      if (data.sent > 0) toast.success(summary);
      else toast.message(summary || "לא נשלחו תזכורות");
      // ריענון ה-Server Component — מעדכן חיווי "תזכורת נשלחה" בכרטיס פגישות מחר
      // ואת ברירת המחדל לסימון בפתיחה הבאה (אחרת הפגישות שנשלחו ייבחרו שוב).
      if (data.sent > 0) router.refresh();
      setOpen(false);
    } catch {
      toast.error("שגיאה בשליחת התזכורות");
    } finally {
      setSending(false);
    }
  }

  // ── דיאלוג זימון עצמי ──
  function handleBookingOpenChange(next: boolean) {
    setBookingOpen(next);
    if (next) void loadClients();
  }

  async function loadClients() {
    setLoadingClients(true);
    setSelectedClients(new Set());
    setClientSearch("");
    setCustomMessage("");
    try {
      const res = await fetch("/api/clients?limit=500");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("שגיאה בטעינת רשימת מטופלים");
        return;
      }
      const raw: { id: string; name?: string; email?: string; phone?: string }[] =
        data.clients || data || [];
      setClients(
        raw.map((c) => ({
          id: c.id,
          name: c.name || "מטופל/ת",
          hasContact: !!(c.email || c.phone),
        })),
      );
    } catch {
      toast.error("שגיאה בטעינת רשימת מטופלים");
    } finally {
      setLoadingClients(false);
    }
  }

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.trim().toLowerCase()),
  );
  const selectableFiltered = filteredClients.filter((c) => c.hasContact);
  const allFilteredSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((c) => selectedClients.has(c.id));

  function toggleClient(id: string) {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected)
        selectableFiltered.forEach((c) => next.delete(c.id));
      else selectableFiltered.forEach((c) => next.add(c.id));
      return next;
    });
  }

  async function handleSendLinks() {
    if (selectedClients.size === 0) return;
    setSendingLinks(true);
    try {
      const res = await fetch("/api/user/booking-settings/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: Array.from(selectedClients),
          customMessage: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || data.error || "שגיאה בשליחת הקישורים");
        return;
      }
      const msg = data.message || `נשלחו ${data.sent ?? 0} קישורים`;
      if ((data.sent ?? 0) > 0) toast.success(msg);
      else toast.message(msg);
      setBookingOpen(false);
    } catch {
      toast.error("שגיאה בשליחת הקישורים");
    } finally {
      setSendingLinks(false);
    }
  }

  // אם אין הרשאת שליחה — אין פעולות מהירות להציג.
  if (!canSendReminders) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">פעולות מהירות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4 text-primary" />
            תזכורות לפגישות
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {pendingCount > 0
              ? `${pendingCount} פגישות ממתינות לתזכורת`
              : "כל הפגישות הקרובות כבר קיבלו תזכורת"}
          </p>
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start mt-2"
                disabled={isShabbat}
                title={isShabbat ? tooltip ?? undefined : undefined}
              >
                <Send className="h-4 w-4 ml-2" />
                שלח תזכורות
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>שליחת תזכורות לפגישות</DialogTitle>
                <DialogDescription>
                  בחר/י את הפגישות שיקבלו תזכורת במייל ו/או SMS. פגישות שכבר
                  קיבלו תזכורת או ללא פרטי קשר אינן ניתנות לבחירה.
                </DialogDescription>
              </DialogHeader>

              <Tabs value={activeDay} onValueChange={handleDayChange}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="tomorrow">מחר</TabsTrigger>
                  <TabsTrigger value="dayAfter">בעוד יומיים</TabsTrigger>
                </TabsList>
              </Tabs>

              <p className="text-xs text-muted-foreground">
                {activeDay === "tomorrow" ? tomorrowLabel : dayAfterLabel}
              </p>

              <div className="max-h-[50vh] overflow-y-auto space-y-1.5 pl-1">
                {activeSessions.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    אין פגישות מתוכננות ליום זה
                  </div>
                ) : (
                  activeSessions.map((s) => {
                    const blocked = !s.hasContact || s.reminderSent;
                    return (
                      <label
                        key={s.id}
                        htmlFor={`rem-${s.id}`}
                        className={`flex items-center gap-3 rounded-md border p-2.5 transition-colors ${
                          blocked
                            ? "opacity-60 cursor-not-allowed"
                            : "cursor-pointer hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          id={`rem-${s.id}`}
                          checked={selectedIds.has(s.id)}
                          onCheckedChange={() => toggle(s.id)}
                          disabled={blocked}
                        />
                        <div className="flex flex-col items-center justify-center w-12 shrink-0">
                          <span className="text-sm font-bold">{s.time}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{s.clientName}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {s.therapistName}
                          </div>
                        </div>
                        {s.reminderSent ? (
                          <span className="flex items-center gap-0.5 text-xs text-emerald-600 shrink-0">
                            <BellRing className="h-3 w-3" aria-hidden />
                            נשלחה
                          </span>
                        ) : !s.hasContact ? (
                          <span className="text-xs text-muted-foreground shrink-0">
                            אין פרטי קשר
                          </span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={handleSend}
                  disabled={selectedCount === 0 || sending || isShabbat}
                  title={isShabbat ? tooltip ?? undefined : undefined}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 ml-2" />
                  )}
                  {sending
                    ? "שולח..."
                    : selectedCount > 0
                      ? `שלח ל-${selectedCount} פגישות`
                      : "בחר/י פגישות"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── שליחת קישור זימון עצמי ── */}
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-primary" />
            קישור לזימון עצמי
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            שליחת קישור אישי למטופל/ת לקביעת תור עצמאית
          </p>
          <Dialog open={bookingOpen} onOpenChange={handleBookingOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start mt-2"
                disabled={isShabbat}
                title={isShabbat ? tooltip ?? undefined : undefined}
              >
                <Send className="h-4 w-4 ml-2" />
                שלח קישור זימון
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>שליחת קישור זימון עצמי</DialogTitle>
                <DialogDescription>
                  בחר/י מטופלים שיקבלו קישור אישי לקביעת תור. הקישור נשלח בשם
                  המטפל/ת של כל מטופל/ת ותקף ל-60 יום.
                </DialogDescription>
              </DialogHeader>

              <div className="relative">
                <Search
                  className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="חיפוש מטופל..."
                  aria-label="חיפוש מטופל"
                  className="pr-9"
                />
              </div>

              {!loadingClients && filteredClients.length > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    className="text-primary hover:underline"
                  >
                    {allFilteredSelected ? "בטל הכל" : "בחר הכל"} (
                    {selectableFiltered.length})
                  </button>
                  {selectedClients.size > 0 && (
                    <span className="text-muted-foreground">
                      {selectedClients.size} נבחרו
                    </span>
                  )}
                </div>
              )}

              <div className="max-h-[45vh] overflow-y-auto space-y-1.5 pl-1">
                {loadingClients ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                    טוען מטופלים...
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    לא נמצאו מטופלים
                  </div>
                ) : (
                  filteredClients.map((c) => (
                    <label
                      key={c.id}
                      htmlFor={`bl-${c.id}`}
                      className={`flex items-center gap-3 rounded-md border p-2.5 transition-colors ${
                        c.hasContact
                          ? "cursor-pointer hover:bg-muted/40"
                          : "opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <Checkbox
                        id={`bl-${c.id}`}
                        checked={selectedClients.has(c.id)}
                        onCheckedChange={() => toggleClient(c.id)}
                        disabled={!c.hasContact}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {c.name}
                      </span>
                      {!c.hasContact && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          אין פרטי קשר
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>

              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="הודעה אישית (לא חובה)"
                aria-label="הודעה אישית למטופל"
                rows={2}
                className="resize-none"
              />

              <DialogFooter>
                <Button
                  onClick={handleSendLinks}
                  disabled={selectedClients.size === 0 || sendingLinks || isShabbat}
                  title={isShabbat ? tooltip ?? undefined : undefined}
                >
                  {sendingLinks ? (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 ml-2" />
                  )}
                  {sendingLinks
                    ? "שולח..."
                    : selectedClients.size > 0
                      ? `שלח ל-${selectedClients.size} מטופלים`
                      : "בחר/י מטופלים"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
