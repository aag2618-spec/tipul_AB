"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Trash2 } from "lucide-react";
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
  return (
    <Dialog open={showOverlapsDialog} onOpenChange={setShowOverlapsDialog}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            פגישות חופפות ({overlaps.length})
          </DialogTitle>
          <DialogDescription>
            הפגישות הבאות חופפות זו לזו. ניתן למחוק את הפגישה הלא רצויה.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {overlaps.map((overlap, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2">
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
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
