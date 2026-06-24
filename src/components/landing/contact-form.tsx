"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  message: "",
  website: "", // honeypot
};

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set =
    (key: keyof typeof form) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "שגיאה בשליחה");
      }
      toast.success("הפנייה נשלחה! נחזור אליכם בהקדם.");
      setForm(EMPTY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 bg-card border rounded-2xl p-6 md:p-8 shadow-sm"
    >
      {/* honeypot — נסתר מבני אדם, בוטים ממלאים */}
      <div className="hidden" aria-hidden="true">
        <label>
          אתר אינטרנט
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={set("website")}
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">
            שם מלא <span className="text-destructive">*</span>
          </Label>
          <Input id="c-name" required value={form.name} onChange={set("name")} placeholder="ישראל ישראלי" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email">
            אימייל <span className="text-destructive">*</span>
          </Label>
          <Input
            id="c-email"
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            placeholder="name@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">טלפון</Label>
          <Input id="c-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="050-1234567" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-org">שם הקליניקה / ארגון</Label>
          <Input id="c-org" value={form.organization} onChange={set("organization")} placeholder="מרכז טיפולי..." />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-message">
          איך נוכל לעזור? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="c-message"
          required
          rows={4}
          value={form.message}
          onChange={set("message")}
          placeholder="ספרו לנו על הקליניקה ועל הצרכים שלכם..."
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? (
          "שולח..."
        ) : (
          <>
            <Send className="w-4 h-4 ml-2" />
            שליחת פנייה
          </>
        )}
      </Button>
    </form>
  );
}
