"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CommitmentFormFields,
  EMPTY_COMMITMENT_FORM,
  buildCommitmentBody,
  type CommitmentFormData,
} from "./commitment-form-fields";

/**
 * דיאלוג עצמאי להוספת התחייבות חדשה למטופל מסוים. מיועד למסכים שמחוץ לתיק
 * המטופל (דף ההתחייבויות ודף הפירוט). אחרי שמירה מצליחה מרענן את הדף
 * (router.refresh) כדי שההתחייבות החדשה תופיע.
 *
 * trigger — אלמנט הלחיצה שיפתח את הדיאלוג. אם לא סופק — כפתור ברירת מחדל.
 */
export function AddCommitmentDialog({
  clientId,
  trigger,
}: {
  clientId: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CommitmentFormData>(EMPTY_COMMITMENT_FORM);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/commitments`, {
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
      setFormData(EMPTY_COMMITMENT_FORM);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בשמירה");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="outline">
            <Plus className="h-4 w-4 ml-1" />
            הוסף התחייבות
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>הוספת התחייבות חדשה</DialogTitle>
          <DialogDescription>הזן את פרטי ההתחייבות מקופת החולים</DialogDescription>
        </DialogHeader>

        <CommitmentFormFields formData={formData} onChange={setFormData} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            צור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
