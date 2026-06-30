"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Copy, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

interface Template {
  code: string;
  name: string;
}

type Channel = "link" | "sms" | "email" | "both";

export function SendQuestionnaireLinkButton({
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
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onControlledOpenChange?.(next);
    else setInternalOpen(next);
  };

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [channel, setChannel] = useState<Channel>("link");
  const [sending, setSending] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/questionnaires");
      if (res.ok) {
        const raw = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: any[] = Array.isArray(raw) ? raw : [];
        // רק שאלוני דיווח-עצמי ניתנים למילוי ע"י המטופל/ההורה.
        const mapped: Template[] = list
          .filter((t) => t.testType === "SELF_REPORT")
          .map((t) => ({ code: t.code, name: t.name }));
        setTemplates(mapped);
      }
    } catch {
      // נשאר עם רשימה ריקה — נציג הודעה ידידותית
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCreatedUrl("");
      setSearch("");
      if (templates.length === 0) loadTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSend = async () => {
    if (!code) {
      toast.error("יש לבחור שאלון");
      return;
    }
    setSending(true);
    setCreatedUrl("");
    try {
      const res = await fetch("/api/questionnaire-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, code, channel }),
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
          toast.success("הקישור נשלח למטופל/ת");
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

  const filtered = templates.filter(
    (t) =>
      !search.trim() ||
      t.name.includes(search.trim()) ||
      t.code.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selectedName = templates.find((t) => t.code === code)?.name;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Send className="ml-2 h-4 w-4" />
            שלח שאלון למילוי
          </Button>
        </DialogTrigger>
      )}
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת שאלון למילוי עצמי</DialogTitle>
          <DialogDescription>
            המטופל/ת או ההורה יקבל/תקבל קישור אישי, ימלא/תמלא בלי התחברות,
            והתוצאה תחזור אליך מנוקדת.
          </DialogDescription>
        </DialogHeader>

        {loadingTemplates ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
            טוען שאלונים...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <p className="mb-1">לא נמצאו שאלוני דיווח-עצמי.</p>
            <p className="text-xs">
              ייתכן שהשאלונים עדיין לא נטענו למערכת. פנה/י למנהל המערכת.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>בחר/י שאלון</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש שאלון..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10 h-9 text-sm"
                />
              </div>
              <div className="border rounded-lg max-h-52 overflow-y-auto">
                {code && (
                  <div className="px-3 py-1.5 bg-teal-50 border-b text-sm font-medium text-teal-700 flex items-center justify-between">
                    <span>נבחר: {selectedName}</span>
                    <button
                      type="button"
                      onClick={() => setCode("")}
                      className="text-xs text-teal-500 hover:text-teal-700"
                    >
                      שנה
                    </button>
                  </div>
                )}
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    לא נמצאו שאלונים
                  </p>
                ) : (
                  filtered.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setCode(t.code)}
                      className={`w-full text-right px-3 py-2 text-sm border-b hover:bg-slate-50 ${
                        code === t.code
                          ? "bg-teal-50 text-teal-700 font-medium"
                          : ""
                      }`}
                    >
                      {t.name}
                      <span className="text-xs text-muted-foreground mr-2">
                        {t.code}
                      </span>
                    </button>
                  ))
                )}
              </div>
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
              {channel === "link" && (
                <p className="text-xs text-muted-foreground">
                  אפשר להעתיק את הקישור ולשלוח גם בוואטסאפ (למשל להורה).
                </p>
              )}
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
            <Button onClick={handleSend} disabled={sending || !code}>
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
