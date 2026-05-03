"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";

interface SmsPackage {
  id: string;
  name: string;
  credits: number;
  priceIls: string | number;
  isActive: boolean;
  createdAt: string;
  _count: { purchases: number };
}

interface FormState {
  name: string;
  credits: string;
  priceIls: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  credits: "100",
  priceIls: "50",
  isActive: true,
};

export default function SmsPackagesPage() {
  const [packages, setPackages] = useState<SmsPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sms-packages");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPackages(data);
    } catch {
      toast.error("שגיאה בטעינת חבילות SMS");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(pkg: SmsPackage) {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      credits: String(pkg.credits),
      priceIls: String(pkg.priceIls),
      isActive: pkg.isActive,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("נדרש שם חבילה");
      return;
    }
    const credits = Number(form.credits);
    const priceIls = Number(form.priceIls);
    if (!credits || credits <= 0 || !Number.isInteger(credits)) {
      toast.error("כמות SMS חייבת להיות מספר שלם חיובי");
      return;
    }
    if (priceIls < 0 || isNaN(priceIls)) {
      toast.error("מחיר חייב להיות מספר אי-שלילי");
      return;
    }

    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/sms-packages/${editingId}`
        : "/api/admin/sms-packages";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          credits,
          priceIls,
          isActive: form.isActive,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success(editingId ? "החבילה עודכנה" : "החבילה נוצרה");
      setDialogOpen(false);
      fetchPackages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/admin/sms-packages/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("החבילה נמחקה");
      setDeleteId(null);
      fetchPackages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה במחיקה");
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">חבילות SMS</h1>
            <p className="text-sm text-muted-foreground">
              קטלוג חבילות SMS לרכישה ע״י משתמשים וקליניקות
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="ml-2 h-4 w-4" />
          חבילה חדשה
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : packages.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">אין חבילות SMS עדיין</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              צור/י חבילה ראשונה כדי שמשתמשים יוכלו לרכוש SMS נוספים.
            </p>
            <Button onClick={openCreate}>
              <Plus className="ml-2 h-4 w-4" />
              צור חבילה
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <Card key={pkg.id} className={!pkg.isActive ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{pkg.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      <span className="inline-flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3" />
                        {pkg._count.purchases} רכישות
                      </span>
                    </CardDescription>
                  </div>
                  {pkg.isActive ? (
                    <Badge className="bg-green-500/20 text-green-400">פעיל</Badge>
                  ) : (
                    <Badge variant="secondary">לא פעיל</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">כמות SMS</p>
                    <p className="font-bold text-lg">
                      {pkg.credits.toLocaleString("he-IL")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">מחיר</p>
                    <p className="font-bold text-lg">
                      {Number(pkg.priceIls).toLocaleString("he-IL")} ₪
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground border-t border-border pt-2">
                  מחיר ל-SMS:{" "}
                  <span className="font-medium text-foreground">
                    {(Number(pkg.priceIls) / pkg.credits).toFixed(3)} ₪
                  </span>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(pkg)}
                  >
                    <Pencil className="ml-2 h-3.5 w-3.5" />
                    עריכה
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteId(pkg.id)}
                    disabled={pkg._count.purchases > 0}
                    title={
                      pkg._count.purchases > 0
                        ? "לא ניתן למחוק חבילה עם רכישות"
                        : "מחיקה"
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "עריכת חבילת SMS" : "חבילת SMS חדשה"}</DialogTitle>
            <DialogDescription>
              חבילות אלה זמינות לרכישה במסך הקנייה של משתמשים וקליניקות.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>שם חבילה *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="חבילת 100 SMS"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>כמות SMS *</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>מחיר (₪) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceIls}
                  onChange={(e) => setForm({ ...form, priceIls: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              חבילה פעילה (זמינה לרכישה)
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {editingId ? "עדכן" : "צור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת חבילת SMS?</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו אינה הפיכה. אם יש רכישות שמצביעות על החבילה — המחיקה תיכשל.
              עדיף לסמן/י כלא-פעילה במקום למחוק.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
