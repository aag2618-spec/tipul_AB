"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
}

type Channel = "link" | "sms" | "email" | "both";

export function SendIntakeLinkButton({
  clientId,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
  showTrigger = true,
}: {
  clientId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  // תמיכה גם במצב uncontrolled (כפתור עצמאי) וגם controlled (נפתח חיצונית,
  // למשל אחרי קביעת פגישת ייעוץ ביומן).
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onControlledOpenChange?.(next);
    else setInternalOpen(next);
  };
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [channel, setChannel] = useState<Channel>("link");
  const [sending, setSending] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/intake-questionnaires");
      if (res.ok) {
        const raw = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: any[] = Array.isArray(raw) ? raw : raw.questionnaires ?? [];
        const mapped: Template[] = list.map((t) => ({ id: t.id, name: t.name }));
        setTemplates(mapped);
        if (mapped.length > 0) setTemplateId((cur) => cur || mapped[0].id);
      }
    } catch {
      // נשאר עם רשימה ריקה — נציג הודעה ידידותית
    } finally {
      setLoadingTemplates(false);
    }
  };

  // טעינת השאלונים + איפוס בכל פתיחה (גם כשנפתח חיצונית במצב controlled).
  useEffect(() => {
    if (open) {
      setCreatedUrl("");
      if (templates.length === 0) loadTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSend = async () => {
    if (!templateId) {
      toast.error("יש לבחור שאלון");
      return;
    }
    setSending(true);
    setCreatedUrl("");
    try {
      const res = await fetch("/api/intake-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, templateId, channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || "שגיאה ביצירת הקישור");
        return;
      }
      if (channel === "link") {
        setCreatedUrl(data.url || "");
        toast.success("הקישור נוצר — אפשר להעתיק ולשלוח");
      } else {
        const sentSms = channel !== "email" && data.results?.sms;
        const sentEmail = channel !== "sms" && data.results?.email;
        if (sentSms || sentEmail) {
          toast.success("הקישור נשלח לפונה");
          setOpen(false);
        } else {
          toast.error(
            "לא נשלח — ייתכן שלמטופל אין טלפון/מייל. נסה/י 'העתקת קישור'."
          );
        }
      }
    } catch {
      toast.error("שגיאה ביצירת הקישור");
    } finally {
      setSending(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(createdUrl);
      toast.success("הקישור הועתק");
    } catch {
      toast.error("לא ניתן להעתיק — סמן/י ידנית");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Send className="ml-2 h-4 w-4" />
            שלח קישור למילוי
          </Button>
        </DialogTrigger>
      )}
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת שאלון פנייה למילוי</DialogTitle>
          <DialogDescription>
            הפונה יקבל/תקבל קישור אישי וימלא/תמלא בלי צורך בהתחברות.
          </DialogDescription>
        </DialogHeader>

        {loadingTemplates ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
            טוען שאלונים...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <p className="mb-3">עדיין אין שאלוני פנייה.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/settings/questionnaires/new">
                צור שאלון ראשון
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>בחר/י שאלון</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר/י שאלון" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>איך לשלוח?</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as Channel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">העתקת קישור (לא שולח)</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">מייל</SelectItem>
                  <SelectItem value="both">SMS + מייל</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createdUrl && (
              <div className="space-y-2">
                <Label>הקישור האישי</Label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={createdUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 border rounded-md px-2 py-1.5 text-xs bg-muted/40 text-muted-foreground"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyUrl}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  הקישור תקף ל-14 ימים וניתן למילוי פעם אחת.
                </p>
              </div>
            )}
          </div>
        )}

        {templates.length > 0 && (
          <DialogFooter>
            <Button onClick={handleSend} disabled={sending || !templateId}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  {channel === "link" ? "יוצר..." : "שולח..."}
                </>
              ) : channel === "link" ? (
                "צור קישור"
              ) : (
                "שלח קישור"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
