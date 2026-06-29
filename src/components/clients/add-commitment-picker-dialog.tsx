"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, Search, ArrowRight, ChevronLeft, User } from "lucide-react";
import { toast } from "sonner";
import {
  CommitmentFormFields,
  EMPTY_COMMITMENT_FORM,
  buildCommitmentBody,
  type CommitmentFormData,
} from "./commitment-form-fields";

export interface ClientPickerItem {
  id: string;
  name: string;
  therapistName: string | null;
}

/**
 * בורר מטופל → הוספת התחייבות. דו-שלבי באותו דיאלוג:
 *   שלב 1 — חיפוש ובחירת מטופל (מקובץ לפי מטפל/ת כש-showTherapist=true, כדי
 *            שבקליניקה רב-מטפלית יהיה ברור לאיזה מטפל/ת שייך כל מטופל).
 *   שלב 2 — טופס ההתחייבות למטופל שנבחר.
 * אחרי שמירה — router.refresh כדי שההתחייבות החדשה תופיע.
 */
export function AddCommitmentPickerDialog({
  clients,
  showTherapist,
}: {
  clients: ClientPickerItem[];
  showTherapist: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ClientPickerItem | null>(null);
  const [formData, setFormData] = useState<CommitmentFormData>(EMPTY_COMMITMENT_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setQuery("");
    setSelected(null);
    setFormData(EMPTY_COMMITMENT_FORM);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  // קיבוץ לפי מטפל/ת (רק כשמציגים מטפלים) — שמירה על סדר ההופעה.
  const groups = useMemo(() => {
    if (!showTherapist) return [{ therapist: null as string | null, items: filtered }];
    const map = new Map<string, ClientPickerItem[]>();
    for (const c of filtered) {
      const key = c.therapistName || "ללא שיוך";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).map(([therapist, items]) => ({ therapist, items }));
  }, [filtered, showTherapist]);

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/clients/${selected.id}/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCommitmentBody(formData)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "שגיאה");
      }
      toast.success("ההתחייבות נוצרה");
      setOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בשמירה");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="ml-2 h-4 w-4" />
          הוספת התחייבות למטופל
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        {selected ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                התחייבות חדשה — {selected.name}
              </DialogTitle>
              <DialogDescription>הזן את פרטי ההתחייבות מקופת החולים</DialogDescription>
            </DialogHeader>

            <CommitmentFormFields formData={formData} onChange={setFormData} />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSelected(null);
                  setFormData(EMPTY_COMMITMENT_FORM);
                }}
                className="sm:ml-auto"
              >
                <ChevronLeft className="ml-1 h-4 w-4" />
                בחירת מטופל אחר
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                צור התחייבות
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>בחירת מטופל</DialogTitle>
              <DialogDescription>
                בחר/י מטופל/ת כדי להוסיף לו/ה התחייבות קופת חולים
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש מטופל..."
                className="pr-9"
                autoFocus
              />
            </div>

            <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  לא נמצאו מטופלים
                </p>
              ) : (
                <div className="space-y-3">
                  {groups.map((g) => (
                    <div key={g.therapist ?? "all"}>
                      {showTherapist && g.therapist && (
                        <div className="text-xs font-semibold text-muted-foreground px-2 py-1 sticky top-0 bg-background">
                          מטפל/ת: {g.therapist}
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {g.items.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelected(c)}
                            className="w-full text-right flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                          >
                            <span className="font-medium">{c.name}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
