"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { SessionOverlap } from "@/types";

interface CalendarOverlapsDialogProps {
  showOverlapsDialog: boolean;
  setShowOverlapsDialog: (show: boolean) => void;
  overlaps: SessionOverlap[];
  deletingOverlap: string | null;
  setDeletingOverlap: (id: string | null) => void;
  fetchData: () => Promise<void>;
  checkOverlaps: () => Promise<void>;
}

export function CalendarOverlapsDialog({
  showOverlapsDialog,
  setShowOverlapsDialog,
  overlaps,
  deletingOverlap,
  setDeletingOverlap,
  fetchData,
  checkOverlaps,
}: CalendarOverlapsDialogProps) {
  // ה-pairKey של ההתראה שמסומנת כרגע "אל תתריע שוב" (להשבתת הכפתור בזמן השמירה).
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

  // הסתרת התראה בלי למחוק פגישה — לחפיפה מכוונת. נשמר בשרת פר-משתמש/ת
  // (DismissedOverlap), ואז checkOverlaps מרענן את הרשימה בלי הזוג הזה.
  async function handleDismiss(overlap: SessionOverlap) {
    const pairKey = [overlap.session1.id, overlap.session2.id].sort().join("|");
    setDismissingKey(pairKey);
    try {
      const res = await fetch("/api/sessions/overlaps/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session1Id: overlap.session1.id,
          session2Id: overlap.session2.id,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("ההתראה הוסתרה ולא תופיע שוב");
      await checkOverlaps();
    } catch {
      toast.error("שגיאה בהסתרת ההתראה");
    } finally {
      setDismissingKey(null);
    }
  }

  return (
    <Dialog open={showOverlapsDialog} onOpenChange={setShowOverlapsDialog}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            פגישות חופפות ({overlaps.length})
          </DialogTitle>
          <DialogDescription>
            הפגישות הבאות חופפות זו לזו. אפשר למחוק את הפגישה הלא רצויה (פח),
            או להסתיר את ההתראה אם החפיפה מכוונת (הסתר) — כך היא לא תופיע שוב.
          </DialogDescription>
        </DialogHeader>
        {overlaps.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            אין כרגע פגישות חופפות 🎉
          </div>
        ) : (
          <div className="space-y-3">
            {overlaps.map((overlap, idx) => {
              const pairKey = [overlap.session1.id, overlap.session2.id].sort().join("|");
              return (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">פגישות באותו זמן</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      disabled={dismissingKey === pairKey}
                      title="הסתר התראה זו — לא תופיע שוב"
                      onClick={() => handleDismiss(overlap)}
                    >
                      <X className="h-4 w-4 ml-1" />
                      הסתר
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <p className="font-medium">{overlap.session1.clientName}</p>
                      <p className="text-muted-foreground">
                        {new Date(overlap.session1.startTime).toLocaleDateString("he-IL")}
                        {" "}
                        {new Date(overlap.session1.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                        {" - "}
                        {new Date(overlap.session1.endTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deletingOverlap === overlap.session1.id}
                      onClick={async () => {
                        if (!confirm("למחוק פגישה זו?")) return;
                        setDeletingOverlap(overlap.session1.id);
                        try {
                          await fetch(`/api/sessions/${overlap.session1.id}`, { method: "DELETE" });
                          toast.success("הפגישה נמחקה");
                          fetchData();
                          checkOverlaps();
                        } catch { toast.error("שגיאה במחיקה"); }
                        setDeletingOverlap(null);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-xs text-center text-amber-500 font-medium">חופפת עם</div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <p className="font-medium">{overlap.session2.clientName}</p>
                      <p className="text-muted-foreground">
                        {new Date(overlap.session2.startTime).toLocaleDateString("he-IL")}
                        {" "}
                        {new Date(overlap.session2.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                        {" - "}
                        {new Date(overlap.session2.endTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deletingOverlap === overlap.session2.id}
                      onClick={async () => {
                        if (!confirm("למחוק פגישה זו?")) return;
                        setDeletingOverlap(overlap.session2.id);
                        try {
                          await fetch(`/api/sessions/${overlap.session2.id}`, { method: "DELETE" });
                          toast.success("הפגישה נמחקה");
                          fetchData();
                          checkOverlaps();
                        } catch { toast.error("שגיאה במחיקה"); }
                        setDeletingOverlap(null);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
