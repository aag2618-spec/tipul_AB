"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AddCustomTaskProps {
  onTaskAdded?: () => void;
}

export function AddCustomTask({ onTaskAdded }: AddCustomTaskProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    dueDate: "",
    hasReminder: false,
    reminderAt: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("נא להזין כותרת למשימה");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM",
          title: formData.title,
          description: formData.description || null,
          priority: formData.priority,
          dueDate: formData.dueDate || null,
          reminderAt: formData.hasReminder && formData.reminderAt ? formData.reminderAt : null,
        }),
      });

      if (!response.ok) {
        throw new Error("שגיאה ביצירת המשימה");
      }

      toast.success("המשימה נוצרה בהצלחה");
      setIsOpen(false);
      setFormData({
        title: "",
        description: "",
        priority: "MEDIUM",
        dueDate: "",
        hasReminder: false,
        reminderAt: "",
      });
      onTaskAdded?.();
    } catch {
      toast.error("שגיאה ביצירת המשימה");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="ml-2 h-4 w-4" />
          מטלה חדשה
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>הוספת מטלה חדשה</DialogTitle>
          <DialogDescription>
            צור מטלה אישית עם אפשרות לתזכורת
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">כותרת</Label>
            <Input
              id="title"
              placeholder="לדוגמה: להתקשר לפלוני"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">תיאור (אופציונלי)</Label>
            <Textarea
              id="description"
              placeholder="פרטים נוספים..."
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">עדיפות</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, priority: value }))
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">נמוכה</SelectItem>
                  <SelectItem value="MEDIUM">בינונית</SelectItem>
                  <SelectItem value="HIGH">גבוהה</SelectItem>
                  <SelectItem value="URGENT">דחופה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">תאריך יעד</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, dueDate: e.target.value }))
                }
                disabled={isSubmitting}
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">תזכורת</p>
              <p className="text-sm text-muted-foreground">
                קבל התראה בתאריך ושעה מסוימים
              </p>
            </div>
            <Switch
              checked={formData.hasReminder}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, hasReminder: checked }))
              }
              disabled={isSubmitting}
            />
          </div>

          {formData.hasReminder && (
            <div className="space-y-2">
              <Label htmlFor="reminderAt">תאריך ושעת תזכורת</Label>
              <Input
                id="reminderAt"
                type="datetime-local"
                value={formData.reminderAt}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reminderAt: e.target.value }))
                }
                disabled={isSubmitting}
                dir="ltr"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  יוצר...
                </>
              ) : (
                "צור מטלה"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
