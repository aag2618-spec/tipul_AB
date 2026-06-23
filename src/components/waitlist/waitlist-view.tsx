"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Clock, UserPlus, Phone } from "lucide-react";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];

interface WaitlistEntry {
  id: string;
  clientId: string;
  preferredTherapistId: string | null;
  durationMinutes: number;
  preferredDays: number[] | null;
  preferredTimeFrom: string | null;
  preferredTimeTo: string | null;
  priority: number;
  note: string | null;
  client: { id: string; name: string; phone: string | null } | null;
}

interface ClientOption {
  id: string;
  name: string;
}
interface TherapistOption {
  id: string;
  name: string | null;
}

export function WaitlistView({
  isOwnPersonalView = false,
}: {
  isOwnPersonalView?: boolean;
}) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);

  const therapistName = useCallback(
    (id: string | null) =>
      id ? therapists.find((t) => t.id === id)?.name || "מטפל/ת" : "כל מטפל",
    [therapists],
  );

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/waitlist", { cache: "no-store" });
      if (res.ok) setEntries(await res.json());
    } catch {
      toast.error("שגיאה בטעינת רשימת ההמתנה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetch("/api/clients?includeQuick=true", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) =>
        setClients(
          Array.isArray(data)
            ? data.map((c: { id: string; name: string }) => ({
                id: c.id,
                name: c.name,
              }))
            : [],
        ),
      )
      .catch(() => setClients([]));
    fetch("/api/clinic/therapists", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTherapists(Array.isArray(data) ? data : []))
      .catch(() => setTherapists([]));
  }, [fetchEntries]);

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch(`/api/waitlist/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        toast.success("הוסר מרשימת ההמתנה");
      } else {
        toast.error("שגיאה בהסרה");
      }
    } catch {
      toast.error("שגיאה בהסרה");
    }
  };

  // בורר/תווית "מטפל מועדף" מוצגים רק בקליניקה רב-מטפלית *ולא* בתצוגת "שלי".
  // ב"שלי" הרשימה מתנהגת כמו אצל מטפל/ת יחיד/ה — בלי בחירת מטפל (כמו ביומן).
  const showTherapist = therapists.length > 1 && !isOwnPersonalView;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">רשימת המתנה</h1>
          <p className="text-muted-foreground">
            מטופלים שממתינים למשבצת פנויה — כשפגישה מתבטלת תוצע התאמה מהרשימה.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          הוסף לרשימה
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            רשימת ההמתנה ריקה. הוסיפו מטופל שמחכה למשבצת מוקדמת.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{entry.client?.name || "מטופל/ת"}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(entry.id)}
                    aria-label="הסר מהרשימה"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                {entry.client?.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    <span dir="ltr">{entry.client.phone}</span>
                  </div>
                )}
                {showTherapist && (
                  <div className="flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" aria-hidden />
                    {therapistName(entry.preferredTherapistId)}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {entry.durationMinutes} דק׳
                  {(entry.preferredTimeFrom || entry.preferredTimeTo) && (
                    <span dir="ltr">
                      {" · "}
                      {entry.preferredTimeFrom || "—"}–{entry.preferredTimeTo || "—"}
                    </span>
                  )}
                </div>
                {entry.preferredDays && entry.preferredDays.length > 0 && (
                  <div>
                    ימים:{" "}
                    {entry.preferredDays
                      .map((d) => DAY_NAMES[d] ?? "")
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
                {entry.note && (
                  <div className="text-xs italic pt-1 border-t">{entry.note}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddWaitlistDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        clients={clients}
        therapists={therapists}
        showTherapistPicker={showTherapist}
        onAdded={() => {
          setAddOpen(false);
          fetchEntries();
        }}
      />
    </div>
  );
}

// ── דיאלוג הוספה ──
function AddWaitlistDialog({
  open,
  onOpenChange,
  clients,
  therapists,
  showTherapistPicker,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
  therapists: TherapistOption[];
  showTherapistPicker: boolean;
  onAdded: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [preferredTherapistId, setPreferredTherapistId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [days, setDays] = useState<number[]>([]);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [priority, setPriority] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setClientId("");
      setClientSearch("");
      setPreferredTherapistId("");
      setDurationMinutes(50);
      setDays([]);
      setTimeFrom("");
      setTimeTo("");
      setPriority(0);
      setNote("");
      setSubmitting(false);
    }
  }, [open]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim();
    const list = q
      ? clients.filter((c) => c.name.includes(q))
      : clients;
    return list.slice(0, 8);
  }, [clients, clientSearch]);

  const selectedClientName = clients.find((c) => c.id === clientId)?.name;

  const toggleDay = (d: number) =>
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );

  const handleSubmit = async () => {
    if (!clientId) {
      toast.error("יש לבחור מטופל");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          preferredTherapistId: preferredTherapistId || undefined,
          durationMinutes,
          preferredDays: days.length > 0 ? days : undefined,
          preferredTimeFrom: timeFrom || undefined,
          preferredTimeTo: timeTo || undefined,
          priority,
          note: note.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success("נוסף לרשימת ההמתנה");
        onAdded();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.message || "שגיאה בהוספה");
      }
    } catch {
      toast.error("שגיאה בהוספה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוספה לרשימת המתנה</DialogTitle>
          <DialogDescription>
            בחרו מטופל והעדפות זמן. כשתתפנה משבצת מתאימה — תוצע התאמה.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* בחירת מטופל */}
          <div className="space-y-1">
            <Label>מטופל</Label>
            {clientId ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{selectedClientName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setClientId("")}
                >
                  שנה
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="חיפוש מטופל…"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {clientSearch.trim() && (
                  <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        לא נמצאו מטופלים
                      </div>
                    ) : (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-right px-3 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            setClientId(c.id);
                            setClientSearch("");
                          }}
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* מטפל מועדף (רק בקליניקה רב-מטפלית) */}
          {showTherapistPicker && therapists.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="wl-therapist">מטפל מועדף</Label>
              <Select
                value={preferredTherapistId || "any"}
                onValueChange={(v) =>
                  setPreferredTherapistId(v === "any" ? "" : v)
                }
              >
                <SelectTrigger id="wl-therapist">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">כל מטפל</SelectItem>
                  {therapists.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name || "מטפל/ת"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* משך + עדיפות */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="wl-duration">משך (דקות)</Label>
              <Input
                id="wl-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wl-priority">עדיפות</Label>
              <Input
                id="wl-priority"
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* ימים מועדפים */}
          <div className="space-y-1">
            <Label>ימים מועדפים (ריק = כל יום)</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((name, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
                    days.includes(idx)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* חלון שעות */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="wl-from">משעה</Label>
              <Input
                id="wl-from"
                type="time"
                dir="ltr"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wl-to">עד שעה</Label>
              <Input
                id="wl-to"
                type="time"
                dir="ltr"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
              />
            </div>
          </div>

          {/* הערה */}
          <div className="space-y-1">
            <Label htmlFor="wl-note">הערה (לא חובה)</Label>
            <Input
              id="wl-note"
              placeholder="פרטים אדמיניסטרטיביים בלבד (לא תוכן טיפולי)"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !clientId}>
            {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            הוסף
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
