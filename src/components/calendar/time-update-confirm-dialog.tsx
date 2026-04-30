"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

export interface TimeUpdateConflict {
  id: string;
  clientName: string;
  startTime: string;
  endTime: string;
}

export interface TimeUpdatePromptData {
  sessionId: string;
  oldStart: Date;
  oldEnd: Date;
  newStart: Date;
  newEnd: Date;
  conflicts: TimeUpdateConflict[];
  source?: "manual" | "drag";
  onCancel?: () => void;
}

interface TimeUpdateConfirmDialogProps {
  prompt: TimeUpdatePromptData | null;
  isSubmitting: boolean;
  onConfirm: (opts: { allowOverlap?: boolean; replaceSessionIds?: string[] }) => void;
  onClose: () => void;
}

const formatDate = (d: Date) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);

const formatTime = (d: Date) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

export function TimeUpdateConfirmDialog({
  prompt,
  isSubmitting,
  onConfirm,
  onClose,
}: TimeUpdateConfirmDialogProps) {
  const [decision, setDecision] = useState<"replace" | "create">("replace");

  useEffect(() => {
    if (prompt) setDecision("replace");
  }, [prompt]);

  const hasConflicts = (prompt?.conflicts.length ?? 0) > 0;

  return (
    <Dialog
      open={!!prompt}
      onOpenChange={(o) => {
        if (!o && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasConflicts && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            {hasConflicts ? "התנגשות עם פגישה קיימת" : "אישור שינוי שעת פגישה"}
          </DialogTitle>
          <DialogDescription>
            {hasConflicts
              ? "באותו זמן כבר קיימת פגישה במערכת. בחר/י מה לעשות."
              : prompt?.source === "drag"
                ? "גררת פגישה למיקום חדש. האם לעדכן את שעת הפגישה?"
                : "האם לעדכן את שעת הפגישה?"}
          </DialogDescription>
        </DialogHeader>

        {prompt && (
          <div className="space-y-4">
            {/* פירוט השינוי: מ-X ל-Y */}
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0 w-6">מ:</span>
                <span>
                  {formatDate(prompt.oldStart)}
                  {" • "}
                  {formatTime(prompt.oldStart)} - {formatTime(prompt.oldEnd)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0 w-6">ל:</span>
                <span className="font-medium">
                  {formatDate(prompt.newStart)}
                  {" • "}
                  {formatTime(prompt.newStart)} - {formatTime(prompt.newEnd)}
                </span>
              </div>
            </div>

            {hasConflicts && (
              <>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-amber-800">
                    {prompt.conflicts.length === 1
                      ? "פגישה חופפת:"
                      : `${prompt.conflicts.length} פגישות חופפות:`}
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {prompt.conflicts.map((c) => (
                      <div
                        key={c.id}
                        className="text-xs text-amber-700 bg-amber-100 rounded px-3 py-2"
                      >
                        <strong>{c.clientName}</strong>
                        {" • "}
                        {formatDate(new Date(c.startTime))}
                        {" • "}
                        {formatTime(new Date(c.startTime))} - {formatTime(new Date(c.endTime))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded hover:bg-muted/50">
                    <input
                      type="radio"
                      name="time-update-decision"
                      className="mt-1"
                      checked={decision === "replace"}
                      onChange={() => setDecision("replace")}
                      disabled={isSubmitting}
                    />
                    <div>
                      <p className="font-medium">
                        {prompt.conflicts.length === 1
                          ? "בטל את הפגישה הקיימת ועדכן"
                          : `בטל את כל ${prompt.conflicts.length} הפגישות החופפות ועדכן`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {prompt.conflicts.length === 1
                          ? "הפגישה הקיימת תסומן כמבוטלת"
                          : "כל הפגישות החופפות יסומנו כמבוטלות"}
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded hover:bg-muted/50">
                    <input
                      type="radio"
                      name="time-update-decision"
                      className="mt-1"
                      checked={decision === "create"}
                      onChange={() => setDecision("create")}
                      disabled={isSubmitting}
                    />
                    <div>
                      <p className="font-medium">עדכן בכל זאת (חפיפה)</p>
                      <p className="text-xs text-muted-foreground">
                        {prompt.conflicts.length === 1
                          ? "שתי הפגישות יישארו ביומן באותו זמן"
                          : "כל הפגישות יישארו ביומן באותו זמן"}
                      </p>
                    </div>
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            ביטול
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || !prompt}
            onClick={() => {
              if (!prompt) return;
              if (hasConflicts && decision === "replace") {
                onConfirm({ replaceSessionIds: prompt.conflicts.map((c) => c.id) });
              } else if (hasConflicts) {
                onConfirm({ allowOverlap: true });
              } else {
                onConfirm({});
              }
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מעדכן...
              </>
            ) : (
              "אישור"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
