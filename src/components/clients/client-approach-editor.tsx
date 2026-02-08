"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ApproachSelector } from "@/components/ai/approach-selector";
import { Brain, X, Info } from "lucide-react";
import { getApproachById } from "@/lib/therapeutic-approaches";

interface ClientApproachEditorProps {
  clientId: string;
  clientName: string;
  currentApproaches: string[];
  currentNotes?: string | null;
  currentCulturalContext?: string | null;
  onSuccess?: () => void;
  disabled?: boolean; // For PRO tier - show but don't allow editing
}

export function ClientApproachEditor({
  clientId,
  clientName,
  currentApproaches,
  currentNotes,
  currentCulturalContext,
  onSuccess,
  disabled = false,
}: ClientApproachEditorProps) {
  const [open, setOpen] = useState(false);
  const [approaches, setApproaches] = useState<string[]>(currentApproaches);
  const [notes, setNotes] = useState(currentNotes || "");
  const [culturalContext, setCulturalContext] = useState(currentCulturalContext || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/approaches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          therapeuticApproaches: approaches,
          approachNotes: notes || null,
          culturalContext: culturalContext || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update approaches");
      }

      toast.success("הגישות הטיפוליות עודכנו בהצלחה");
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating approaches:", error);
      toast.error(error instanceof Error ? error.message : "שגיאה בעדכון גישות");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setApproaches([]);
    setNotes("");
    setCulturalContext("");
  };

  const selectedApproachsObjects = approaches
    .map((id) => getApproachById(id))
    .filter((a) => a !== undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Brain className="h-4 w-4" />
          {currentApproaches.length > 0
            ? `${currentApproaches.length} גישות ספציפיות`
            : "הגדר גישות ספציפיות"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            גישות טיפוליות ספציפיות עבור {clientName}
          </DialogTitle>
          <DialogDescription>
            בחר גישות טיפוליות ספציפיות עבור מטופל זה. אם לא תבחר כלום, המערכת
            תשתמש בגישות ברירת המחדל שלך.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <strong>שים לב:</strong> אם תבחר גישות כאן, הן יחליפו את ברירת המחדל
              שלך עבור מטופל זה בלבד. זה שימושי כשאתה עובד עם מטופל ספציפי בגישה
              שונה מהרגיל.
            </div>
          </div>

          {/* Approach Selector */}
          <div className="space-y-2">
            <Label>בחר גישות טיפוליות</Label>
            <ApproachSelector value={approaches} onChange={setApproaches} disabled={disabled} />
          </div>

          {/* Notes */}
          {!disabled && (
            <div className="space-y-2">
              <Label htmlFor="notes">הערות נוספות (אופציונלי)</Label>
              <Textarea
                id="notes"
                placeholder="הערות ספציפיות על הגישה הטיפולית עם מטופל זה..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          )}

          {/* Cultural Context */}
          {!disabled && (
            <div className="space-y-2">
              <Label htmlFor="cultural-context">הקשר תרבותי (אופציונלי)</Label>
              <p className="text-xs text-muted-foreground">
                שורה-שתיים על הרקע התרבותי של המטופל. עוזר ל-AI לא לפרש התנהגות נורמטיבית כפתולוגיה.
              </p>
              <Textarea
                id="cultural-context"
                placeholder="לדוגמה: מטופל מרקע שמרני, מעורבות משפחתית גבוהה היא נורמטיבית..."
                value={culturalContext}
                onChange={(e) => setCulturalContext(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          )}

          {/* Clear Button */}
          {!disabled && (approaches.length > 0 || notes) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="w-full"
            >
              <X className="h-4 w-4 ml-2" />
              נקה הכל (השתמש בברירת מחדל)
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {disabled ? "סגור" : "ביטול"}
          </Button>
          {!disabled && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
