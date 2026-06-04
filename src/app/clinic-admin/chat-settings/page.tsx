"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  MessagesSquare,
  Save,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

export default function ChatSettingsPage() {
  const [allow, setAllow] = useState(false);
  const [initial, setInitial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/clinic-admin/chat-settings");
        if (cancelled) return;
        if (!res.ok) {
          setError(
            res.status === 403
              ? "הגישה לדף זה זמינה רק לבעלי/ות קליניקה."
              : "שגיאה בטעינת הגדרות הצ׳אט."
          );
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          const value = !!json.allowTherapistChat;
          setAllow(value);
          setInitial(value);
        }
      } catch {
        if (!cancelled) setError("שגיאת רשת בטעינת ההגדרות.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = allow !== initial;

  async function onSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/clinic-admin/chat-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowTherapistChat: allow }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.message || "שגיאה בשמירה");
        return;
      }
      toast.success(
        allow
          ? "צ׳אט בין מטפלים הופעל"
          : "צ׳אט בין מטפלים כובה — שיחות קיימות נסגרו"
      );
      setInitial(allow);
    } catch {
      toast.error("שגיאת רשת בשמירה");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="flex justify-center py-16"
        role="status"
        aria-live="polite"
        dir="rtl"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">טוען הגדרות צ׳אט…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" aria-hidden="true" />
            <p className="font-medium">{error}</p>
            <Button asChild variant="outline">
              <Link href="/clinic-admin">
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                חזרה לסקירה
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <MessagesSquare className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">הגדרות צ׳אט</h1>
          <p className="text-sm text-muted-foreground">
            ניהול ההרשאות של צ׳אט הצוות בקליניקה.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">צ׳אט בין מטפלים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="allow-therapist-chat" className="text-base">
                לאפשר למטפלים להתכתב בינם לבין עצמם
              </Label>
              <p className="text-sm text-muted-foreground max-w-prose leading-relaxed">
                כשהאפשרות פעילה, מטפלים יכולים לפתוח שיחות פרטיות וקבוצות זה עם
                זה. ללא קשר להגדרה זו, מטפלים <strong>תמיד</strong> יכולים
                להתכתב עם המנהלת והמזכירות.
              </p>
            </div>
            <Switch
              id="allow-therapist-chat"
              checked={allow}
              onCheckedChange={setAllow}
              aria-label="לאפשר צ׳אט בין מטפלים"
              className="mt-1"
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground space-y-2">
            <div className="flex gap-2">
              <Eye className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                שקיפות: ההתכתבויות בין המטפלים גלויות לך במסך &quot;מעקב שיחות
                מטפלים&quot;, והמטפלים רואים על כך הודעת שקיפות בצ׳אט.
              </span>
            </div>
            <div className="flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                אם תכבי את האפשרות, השיחות הקיימות בין מטפלים ייסגרו ולא יהיו
                נגישות להם יותר.
              </span>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/clinic-admin/chat-oversight">
                <Eye className="ml-2 h-4 w-4" aria-hidden="true" />
                למסך מעקב שיחות מטפלים
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving || !isDirty} aria-busy={saving}>
          {saving ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" aria-hidden="true" />
              שומר…
            </>
          ) : (
            <>
              <Save className="ml-2 h-4 w-4" aria-hidden="true" />
              שמור
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
