"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  Percent,
  Users,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  discountPercent: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  targetAudience: "NEW_SUBSCRIBERS" | "UPGRADERS" | "ALL";
  forCurrentTier: "ESSENTIAL" | "PRO" | "ENTERPRISE" | null;
  discountOnTier: "ESSENTIAL" | "PRO" | "ENTERPRISE" | null;
  createdAt: string;
}

const TARGET_LABELS: Record<string, string> = {
  ALL: "כולם",
  NEW_SUBSCRIBERS: "מצטרפים חדשים",
  UPGRADERS: "משדרגי מסלול",
};

const TIER_LABELS: Record<string, string> = {
  ESSENTIAL: "בסיסי",
  PRO: "מקצועי",
  ENTERPRISE: "ארגוני",
};

function formatDate(date: string | null) {
  if (!date) return "ללא הגבלה";
  return new Date(date).toLocaleDateString("he-IL");
}

function isPromotionActive(p: Promotion) {
  if (!p.isActive) return false;
  const now = new Date();
  if (new Date(p.validFrom) > now) return false;
  if (p.validUntil && new Date(p.validUntil) <= now) return false;
  return true;
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    discountPercent: 0,
    validFrom: new Date().toISOString().split("T")[0],
    validUntil: "",
    isActive: true,
    targetAudience: "ALL" as "NEW_SUBSCRIBERS" | "UPGRADERS" | "ALL",
    forCurrentTier: "" as "" | "ESSENTIAL" | "PRO" | "ENTERPRISE",
    discountOnTier: "" as "" | "ESSENTIAL" | "PRO" | "ENTERPRISE",
  });

  useEffect(() => {
    fetchPromotions();
  }, []);

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/promotions");
      if (res.ok) {
        const data = await res.json();
        setPromotions(data.promotions);
      } else {
        toast.error("שגיאה בטעינת מבצעים");
      }
    } catch {
      toast.error("שגיאה בטעינת מבצעים");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      discountPercent: 0,
      validFrom: new Date().toISOString().split("T")[0],
      validUntil: "",
      isActive: true,
      targetAudience: "ALL",
      forCurrentTier: "",
      discountOnTier: "",
    });
    setEditingId(null);
  };

  const openEdit = (p: Promotion) => {
    setForm({
      title: p.title,
      description: p.description ?? "",
      discountPercent: p.discountPercent,
      validFrom: new Date(p.validFrom).toISOString().split("T")[0],
      validUntil: p.validUntil
        ? new Date(p.validUntil).toISOString().split("T")[0]
        : "",
      isActive: p.isActive,
      targetAudience: p.targetAudience,
      forCurrentTier: p.forCurrentTier ?? "",
      discountOnTier: p.discountOnTier ?? "",
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("חובה להזין כותרת למבצע");
      return;
    }

    setSaving(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        title: form.title,
        description: form.description || null,
        discountPercent: form.discountPercent,
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: form.validUntil
          ? new Date(form.validUntil).toISOString()
          : null,
        isActive: form.isActive,
        targetAudience: form.targetAudience,
        forCurrentTier: form.forCurrentTier || null,
        discountOnTier: form.discountOnTier || null,
      };

      const res = await fetch("/api/admin/promotions", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editingId ? "המבצע עודכן בהצלחה" : "המבצע נוצר בהצלחה");
        setShowForm(false);
        resetForm();
        fetchPromotions();
      } else {
        const err = await res.json();
        toast.error(err.message || "שגיאה בשמירת מבצע");
      }
    } catch {
      toast.error("שגיאה בשמירת מבצע");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/admin/promotions?id=${deleteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("המבצע נמחק");
        setDeleteId(null);
        fetchPromotions();
      } else {
        toast.error("שגיאה במחיקת מבצע");
      }
    } catch {
      toast.error("שגיאה במחיקת מבצע");
    }
  };

  const toggleActive = async (p: Promotion) => {
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, isActive: !p.isActive }),
      });
      if (res.ok) {
        toast.success(p.isActive ? "המבצע הושבת" : "המבצע הופעל");
        fetchPromotions();
      }
    } catch {
      toast.error("שגיאה בעדכון מבצע");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Megaphone className="h-8 w-8 text-primary" />
            ניהול מבצעים
          </h1>
          <p className="text-muted-foreground mt-1">
            יצירת מבצעים זמניים עם הנחה והודעה למשתמשים
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="ml-2 h-4 w-4" />
          מבצע חדש
        </Button>
      </div>

      {/* טופס יצירה/עריכה */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>
              {editingId ? "עריכת מבצע" : "מבצע חדש"}
            </CardTitle>
            <CardDescription>
              המבצע יוצג למשתמשים בדף ניהול המנוי
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm text-muted-foreground">
                  כותרת המבצע
                </label>
                <Input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="למשל: מבצע חודש יוני — 20% הנחה למצטרפים חדשים!"
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm text-muted-foreground">
                  תיאור (אופציונלי)
                </label>
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="תיאור מורחב שיוצג למשתמשים..."
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  אחוז הנחה
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.discountPercent}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        discountPercent: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  קהל יעד
                </label>
                <Select
                  value={form.targetAudience}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      targetAudience: v as typeof f.targetAudience,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">כולם</SelectItem>
                    <SelectItem value="NEW_SUBSCRIBERS">
                      מצטרפים חדשים בלבד
                    </SelectItem>
                    <SelectItem value="UPGRADERS">
                      משדרגי מסלול בלבד
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  רק למי שנמצא במסלול (ריק = כולם)
                </label>
                <Select
                  value={form.forCurrentTier}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      forCurrentTier: v === "ALL_TIERS" ? "" : v as typeof f.forCurrentTier,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="כל המסלולים" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_TIERS">כל המסלולים</SelectItem>
                    <SelectItem value="ESSENTIAL">בסיסי</SelectItem>
                    <SelectItem value="PRO">מקצועי</SelectItem>
                    <SelectItem value="ENTERPRISE">ארגוני</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  הנחה על מסלול ספציפי (ריק = כולם)
                </label>
                <Select
                  value={form.discountOnTier}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      discountOnTier: v === "ALL_TIERS" ? "" : v as typeof f.discountOnTier,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="כל המסלולים" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_TIERS">כל המסלולים</SelectItem>
                    <SelectItem value="ESSENTIAL">בסיסי</SelectItem>
                    <SelectItem value="PRO">מקצועי</SelectItem>
                    <SelectItem value="ENTERPRISE">ארגוני</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  תאריך התחלה
                </label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, validFrom: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  תאריך סיום (ריק = ללא הגבלה)
                </label>
                <Input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, validUntil: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                ביטול
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingId ? "עדכן מבצע" : "צור מבצע"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* רשימת מבצעים */}
      {promotions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">אין מבצעים</p>
            <p className="text-sm">צור מבצע חדש כדי להציג הנחה זמנית למשתמשים</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {promotions.map((p) => {
            const active = isPromotionActive(p);
            return (
              <Card
                key={p.id}
                className={active ? "border-green-500/30" : "opacity-60"}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{p.title}</h3>
                        {active ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 ml-1" />
                            פעיל
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 ml-1" />
                            לא פעיל
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-sm text-muted-foreground">
                          {p.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Percent className="h-3.5 w-3.5" />
                          {p.discountPercent}% הנחה
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(p.validFrom)} — {formatDate(p.validUntil)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {TARGET_LABELS[p.targetAudience]}
                          {p.forCurrentTier && ` (רק ${TIER_LABELS[p.forCurrentTier]})`}
                          {p.discountOnTier && ` → ${TIER_LABELS[p.discountOnTier]}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(p)}
                        title={p.isActive ? "השבת" : "הפעל"}
                      >
                        {p.isActive ? (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(p.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* דיאלוג אישור מחיקה */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת מבצע</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את המבצע? הפעולה בלתי הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
