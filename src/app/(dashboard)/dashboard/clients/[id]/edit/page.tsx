"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Archive, Clock, UserCheck, Trash2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Client {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  address: string | null;
  status: string;
  defaultSessionPrice: number | null;
  notes: string | null;
  initialDiagnosis: string | null;
  intakeNotes: string | null;
  consentToAI: boolean | null;
  consentToAIAt: string | null;
}

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  // R1 (סבב 17a) + R2 (סבב 17b-ui): ייצוא DSAR לפני מחיקה — חוק הגנת הפרטיות
  // §13. המלצה למטפל לתת למטופל עותק מלא של הנתונים שלו לפני מחיקה
  // לצמיתות.
  const [isExporting, setIsExporting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    birthDate: "",
    address: "",
    status: "ACTIVE",
    defaultSessionPrice: "",
    notes: "",
    initialDiagnosis: "",
  });
  // M1 — consentToAI ב-state נפרד כי הוא boolean (לא string כמו שאר ה-formData).
  // null = ערך מקורי לפני המיגרציה; ב-UI מציגים כ-"ברירת מחדל (מאשר)".
  const [consentToAI, setConsentToAI] = useState<boolean | null>(null);
  const [consentToAIAt, setConsentToAIAt] = useState<string | null>(null);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const response = await fetch(`/api/clients/${id}?fields=basic`);
        if (response.ok) {
          const data = await response.json();
          setClient(data);
          setFormData({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            phone: data.phone || "",
            email: data.email || "",
            birthDate: data.birthDate ? data.birthDate.split("T")[0] : "",
            address: data.address || "",
            status: data.status === "INACTIVE" ? "ARCHIVED" : (data.status || "ACTIVE"),
            defaultSessionPrice: data.defaultSessionPrice ? String(data.defaultSessionPrice) : "",
            notes: data.notes || "",
            initialDiagnosis: data.initialDiagnosis || "",
          });
          setConsentToAI(data.consentToAI ?? null);
          setConsentToAIAt(data.consentToAIAt ?? null);
        }
      } catch (error) {
        console.error("Failed to fetch client:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClient();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error("נא להזין שם פרטי ושם משפחה");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          birthDate: formData.birthDate || null,
          defaultSessionPrice: formData.defaultSessionPrice ? parseFloat(formData.defaultSessionPrice) : null,
          consentToAI,
        }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בעדכון");
      }

      toast.success("פרטי המטופל עודכנו בהצלחה");
      router.push(`/dashboard/clients/${id}`);
    } catch (error) {
      console.error("Update error:", error);
      toast.error("אירעה שגיאה בעדכון");
    } finally {
      setIsSaving(false);
    }
  };

  // firstName/lastName יכולים להיות null ב-DB; משתמשים ב-name כ-fallback בטוח
  const fullName = client
    ? [client.firstName, client.lastName]
        .filter((s): s is string => Boolean(s))
        .join(" ")
        .trim() || client.name
    : "";

  const handleDelete = async () => {
    if (confirmName.trim() !== fullName) {
      toast.error("השם שהוקלד אינו תואם");
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/clients/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || "שגיאה במחיקה");
      }

      toast.success("המטופל נמחק בהצלחה");
      router.push("/dashboard/clients");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה במחיקה");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">מטופל לא נמצא</p>
        <Button asChild>
          <Link href="/dashboard/clients">חזרה לרשימה</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">עריכת מטופל</h1>
          <p className="text-muted-foreground">{fullName}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>פרטים אישיים</CardTitle>
            <CardDescription>מידע בסיסי על המטופל</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">שם פרטי *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="שם פרטי"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">שם משפחה *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="שם משפחה"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">טלפון</Label>
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="050-0000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate">תאריך לידה</Label>
                <Input
                  id="birthDate"
                  type="date"
                  dir="ltr"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address">כתובת</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="כתובת מגורים"
                />
              </div>

              <div className="space-y-2">
                <Label>סטטוס מטופל</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.status === "ACTIVE" ? "default" : "outline"}
                    className={`flex-1 gap-1.5 h-9 ${formData.status === "ACTIVE" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                    onClick={() => setFormData({ ...formData, status: "ACTIVE" })}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    פעיל
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.status === "WAITING" ? "default" : "outline"}
                    className={`flex-1 gap-1.5 h-9 ${formData.status === "WAITING" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                    onClick={() => setFormData({ ...formData, status: "WAITING" })}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    ממתין
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.status === "ARCHIVED" ? "default" : "outline"}
                    className={`flex-1 gap-1.5 h-9 ${formData.status === "ARCHIVED" ? "bg-slate-500 hover:bg-slate-600" : ""}`}
                    onClick={() => setFormData({ ...formData, status: "ARCHIVED" })}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    ארכיון
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultSessionPrice">מחיר פגישה ברירת מחדל (₪)</Label>
              <Input
                id="defaultSessionPrice"
                type="number"
                min="0"
                step="1"
                dir="ltr"
                className="text-left"
                value={formData.defaultSessionPrice}
                onChange={(e) => setFormData({ ...formData, defaultSessionPrice: e.target.value })}
                placeholder="300"
              />
              <p className="text-xs text-muted-foreground">
                המחיר ימולא אוטומטית בעת יצירת פגישה חדשה
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardHeader>
            <CardTitle>אבחון ראשוני</CardTitle>
            <CardDescription>האבחון הראשוני שלך לגבי המטופל</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.initialDiagnosis}
              onChange={(e) => setFormData({ ...formData, initialDiagnosis: e.target.value })}
              placeholder="תאר את האבחון הראשוני שלך..."
              rows={5}
            />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>הערות נוספות</CardTitle>
            <CardDescription>מידע נוסף על המטופל</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* M1 — הסכמה לעיבוד AI (חוק הגנת הפרטיות §13) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              הסכמה לעיבוד נתונים ב-AI
            </CardTitle>
            <CardDescription>
              חוק הגנת הפרטיות (סעיף 13) מחייב הסכמה מפורשת של המטופל לפני עיבוד
              נתוניו הקליניים בכלי AI חיצוניים (כולל ניתוח שאלונים, תמלולים וסיכומים).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="space-y-1 flex-1">
                <Label htmlFor="consentToAI" className="text-base font-medium cursor-pointer">
                  המטופל אישר עיבוד נתוניו ב-AI
                </Label>
                <p className="text-sm text-muted-foreground">
                  {consentToAI === false
                    ? "המטופל סירב במפורש — כל פעולות ה-AI על נתוניו חסומות."
                    : "המטופל אישר (או טרם הוחתם) — פעולות ה-AI מאופשרות."}
                </p>
                {consentToAIAt && (
                  <p className="text-xs text-muted-foreground">
                    עודכן בתאריך: {new Date(consentToAIAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
                  </p>
                )}
              </div>
              <Switch
                id="consentToAI"
                checked={consentToAI !== false}
                onCheckedChange={(checked) => setConsentToAI(checked)}
              />
            </div>
            {consentToAI === false && (
              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                <strong>שים לב:</strong> כל ניסיון להפעיל ניתוח AI, תמלול או סיכום על נתוני המטופל
                יוחזר עם הודעת שגיאה למטפל. ניתן להחזיר את ההסכמה בכל עת.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href={`/dashboard/clients/${id}`}>ביטול</Link>
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                שמור שינויים
              </>
            )}
          </Button>
        </div>
      </form>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            אזור מסוכן
          </CardTitle>
          <CardDescription>
            מחיקת מטופל היא פעולה <strong>בלתי הפיכה</strong>. כל הפגישות, התשלומים, ההקלטות, הסיכומים והמסמכים של המטופל יימחקו לצמיתות.
            לפני מחיקה — מומלץ להעביר את המטופל ל"ארכיון" במקום (שדה הסטטוס למעלה), או לייצא תחילה את הנתונים מעמוד המטופל.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setConfirmName("");
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="ml-2 h-4 w-4" />
            מחק מטופל לצמיתות
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!isDeleting) setDeleteDialogOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              מחיקת מטופל לצמיתות
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-right">
                <p>
                  פעולה זו תמחק את <strong>{fullName}</strong> ואת <strong>כל</strong> הנתונים הקשורים אליו:
                  פגישות, תשלומים, חשבוניות, הקלטות, תמלולים, סיכומים, מסמכים והערות.
                </p>
                <p className="font-semibold text-destructive">
                  אי אפשר לשחזר את הנתונים אחרי המחיקה.
                </p>
                <p>
                  כדי לאשר, הקלד את השם המלא של המטופל: <strong>{fullName}</strong>
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* R1+R2 (סבב 17a/17b-ui): המלצה לייצא DSAR לפני מחיקה — לתת
              למטופל עותק מלא לפי חוק הגנת הפרטיות §13. */}
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 space-y-2">
            <p className="text-sm text-blue-900 font-medium">
              לפני מחיקה — מומלץ לייצא עותק של כל הנתונים האישיים של המטופל
              (DSAR), בהתאם לחוק הגנת הפרטיות §13.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isDeleting || isExporting}
              onClick={async () => {
                setIsExporting(true);
                try {
                  const res = await fetch(
                    `/api/clients/${id}/export-personal-data`,
                    { method: "POST" }
                  );
                  if (!res.ok) {
                    if (res.status === 429) {
                      toast.error("ביצעת ייצוא רב לאחרונה. נסה בעוד שעה.");
                    } else {
                      toast.error("שגיאה בייצוא הנתונים");
                    }
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `DSAR-${fullName || "client"}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success("הנתונים יוצאו בהצלחה");
                } catch {
                  toast.error("שגיאה בייצוא הנתונים");
                } finally {
                  setIsExporting(false);
                }
              }}
            >
              {isExporting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מייצא...
                </>
              ) : (
                "ייצא נתונים אישיים (DSAR) לפני מחיקה"
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmName">שם מלא לאישור</Label>
            <Input
              id="confirmName"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={fullName}
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || !fullName || confirmName.trim() !== fullName}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מוחק...
                </>
              ) : (
                <>
                  <Trash2 className="ml-2 h-4 w-4" />
                  כן, מחק לצמיתות
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}






