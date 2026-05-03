"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserMinus,
  AlertCircle,
  Loader2,
  ArrowRight,
  Building2,
  Users,
  Clock,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Preview {
  organization: { id: string; name: string } | null;
  therapistName: string | null;
  activeClients: number;
  existingDeparture: {
    id: string;
    decisionDeadline: string;
    initiatedAt: string;
  } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  });
}

export default function ClinicLeavePage() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [days, setDays] = useState("14");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ clientCount: number; deadline: string } | null>(null);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/clinic/leave");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || "שגיאה");
        return;
      }
      const data = await res.json();
      setPreview(data);
    } catch {
      setError("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/clinic/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionDeadlineDays: Number(days) || 14,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      const data = await res.json();
      setSuccess({ clientCount: data.clientCount, deadline: data.decisionDeadline });
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelExisting() {
    if (!preview?.existingDeparture) return;
    try {
      const res = await fetch("/api/dashboard/clinic/leave", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("תהליך העזיבה בוטל");
      fetchPreview();
    } catch {
      toast.error("שגיאה בביטול");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-medium">{error}</p>
            <Button asChild variant="outline">
              <Link href="/dashboard">חזרה לדשבורד</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card className="border-green-500/40">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
            <div>
              <p className="text-xl font-bold">תהליך העזיבה נוצר בהצלחה</p>
              <p className="text-sm text-muted-foreground mt-2">
                {success.clientCount} מטופלים יקבלו הודעה ויוכלו לבחור אם להישאר בקליניקה
                או לעבור איתך.
                <br />
                המועד האחרון לבחירה: {formatDate(success.deadline)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-md">
              <strong>מה קורה עכשיו:</strong> המערכת תיצור קישורים אישיים לכל מטופל.
              ההודעות יישלחו ע״י בעל/ת הקליניקה או באופן אוטומטי בקרוב. בעלי הקליניקה
              יכולים לראות את התקדמות התהליך בממשק שלהם.
            </p>
            <Button asChild>
              <Link href="/dashboard">חזרה לדשבורד</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) return null;

  if (preview.existingDeparture) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">
            <ArrowRight className="ml-2 h-4 w-4" />
            חזרה לדשבורד
          </Link>
        </Button>
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-400" />
              תהליך עזיבה כבר פעיל
            </CardTitle>
            <CardDescription>
              נוצר ב-{formatDate(preview.existingDeparture.initiatedAt)} · מועד אחרון
              לבחירה: {formatDate(preview.existingDeparture.decisionDeadline)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              קיים תהליך עזיבה פעיל שכבר התחיל. עד למועד הסיום, המטופלים שלך מקבלים
              הזדמנות לבחור.
            </p>
            <p className="text-sm text-muted-foreground">
              אם החלטת להישאר בכל זאת, ניתן לבטל את התהליך עכשיו.
            </p>
            <Button variant="outline" onClick={handleCancelExisting}>
              ביטול תהליך העזיבה
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview.organization) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-medium">אינך משויכ/ת לקליניקה</p>
            <p className="text-sm text-muted-foreground">
              דף זה זמין רק למטפלים העובדים בקליניקה רב-מטפלים.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto" dir="rtl">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard">
          <ArrowRight className="ml-2 h-4 w-4" />
          חזרה לדשבורד
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-500/15 rounded-lg">
          <UserMinus className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">עזיבת קליניקה</h1>
          <p className="text-sm text-muted-foreground">
            תהליך מסודר להפסקת עבודה בקליניקה {preview.organization.name}
          </p>
        </div>
      </div>

      {/* הסבר */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">איך זה עובד?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-3">
            <span className="font-bold text-primary">1.</span>
            <div>
              <strong>יצירת תהליך</strong> — את/ה בוחר/ת מועד אחרון לבחירת המטופלים
              (7-90 ימים).
            </div>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-primary">2.</span>
            <div>
              <strong>קישור אישי לכל מטופל</strong> — המערכת יוצרת token מאובטח לכל
              מטופל ושולחת לו הודעה.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-primary">3.</span>
            <div>
              <strong>בחירה</strong> — המטופל מקבל החלטה: להישאר בקליניקה או לעבור איתך.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-primary">4.</span>
            <div>
              <strong>במועד הסיום</strong> — מטופלים שלא בחרו נשארים אוטומטית בקליניקה
              (ברירת מחדל בטוחה).
            </div>
          </div>
        </CardContent>
      </Card>

      {/* פרטי הקליניקה */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">קליניקה:</span>
            <span className="font-medium">{preview.organization.name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">מטופלים פעילים:</span>
            <span className="font-medium">{preview.activeClients}</span>
            {preview.activeClients > 0 && (
              <span className="text-xs text-muted-foreground">
                — כל אחד יקבל אפשרות לבחור
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* טופס */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">פרטי תהליך העזיבה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>תקופת בחירה (בימים) *</Label>
            <Input
              type="number"
              min={7}
              max={90}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              בין 7 ל-90 ימים. ברירת מחדל מומלצת: 14 ימים.
            </p>
          </div>
          <div className="space-y-2">
            <Label>סיבת העזיבה (אופציונלי, פנימי לאדמין)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="למשל: מעבר לקליניקה אחרת, פתיחת קליניקה עצמאית..."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm space-y-2">
              <p className="font-medium text-amber-400">לפני שמתחילים — שים/י לב</p>
              <ul className="space-y-1 text-xs text-muted-foreground list-disc pr-5">
                <li>לא ניתן לבטל את התהליך אחרי שמטופלים בחרו לעבור איתך.</li>
                <li>פגישות עבר נשארות בקליניקה (היסטוריה רפואית-חוקית).</li>
                <li>פרטי תשלום וקבלות נשארים בקליניקה.</li>
                <li>בעל/ת הקליניקה מקבל/ת התראה ויכול/ה לדבר איתך לפני המועד הסופי.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {preview.activeClients === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          אין מטופלים פעילים שמשויכים אליך — פנה/י ישירות לבעל/ת הקליניקה.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">ביטול</Link>
        </Button>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={preview.activeClients === 0}
        >
          התחל תהליך עזיבה
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור יצירת תהליך עזיבה</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{preview.activeClients} מטופלים</strong> יקבלו הודעה ויוכלו לבחור.
              לאחר {days} ימים — מי שלא בחר יישאר אוטומטית בקליניקה.
              <br />
              <br />
              לא ניתן לבטל באמצע אם מטופלים כבר בחרו לעבור איתך.
              <br />
              <br />
              להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              צור תהליך
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
