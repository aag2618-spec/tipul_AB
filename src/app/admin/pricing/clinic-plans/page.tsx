"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Loader2,
  Star,
} from "lucide-react";
import { toast } from "sonner";

type AITier = "ESSENTIAL" | "PRO" | "ENTERPRISE";

interface ClinicPlan {
  id: string;
  name: string;
  internalCode: string;
  isActive: boolean;
  isDefault: boolean;
  baseFeeIls: string | number;
  includedTherapists: number;
  perTherapistFeeIls: string | number;
  volumeDiscountAtCount: number | null;
  perTherapistAtVolumeIls: string | number | null;
  freeSecretaries: number;
  perSecretaryFeeIls: string | number | null;
  smsQuotaPerMonth: number;
  aiTierIncluded: AITier | null;
  aiAddonDiscountPercent: number | null;
  maxTherapists: number | null;
  maxSecretaries: number | null;
  description: string | null;
  _count: { organizations: number };
}

interface PlanFormState {
  name: string;
  internalCode: string;
  isActive: boolean;
  isDefault: boolean;
  baseFeeIls: string;
  includedTherapists: string;
  perTherapistFeeIls: string;
  volumeDiscountAtCount: string;
  perTherapistAtVolumeIls: string;
  freeSecretaries: string;
  perSecretaryFeeIls: string;
  smsQuotaPerMonth: string;
  aiTierIncluded: AITier | "NONE";
  aiAddonDiscountPercent: string;
  maxTherapists: string;
  maxSecretaries: string;
  description: string;
}

const emptyForm: PlanFormState = {
  name: "",
  internalCode: "",
  isActive: true,
  isDefault: false,
  baseFeeIls: "200",
  includedTherapists: "1",
  perTherapistFeeIls: "80",
  volumeDiscountAtCount: "",
  perTherapistAtVolumeIls: "",
  freeSecretaries: "3",
  perSecretaryFeeIls: "",
  smsQuotaPerMonth: "500",
  aiTierIncluded: "NONE",
  aiAddonDiscountPercent: "",
  maxTherapists: "",
  maxSecretaries: "",
  description: "",
};

function planToForm(plan: ClinicPlan): PlanFormState {
  const num = (v: string | number | null | undefined): string =>
    v === null || v === undefined ? "" : String(v);
  return {
    name: plan.name,
    internalCode: plan.internalCode,
    isActive: plan.isActive,
    isDefault: plan.isDefault,
    baseFeeIls: num(plan.baseFeeIls),
    includedTherapists: String(plan.includedTherapists),
    perTherapistFeeIls: num(plan.perTherapistFeeIls),
    volumeDiscountAtCount: num(plan.volumeDiscountAtCount),
    perTherapistAtVolumeIls: num(plan.perTherapistAtVolumeIls),
    freeSecretaries: String(plan.freeSecretaries),
    perSecretaryFeeIls: num(plan.perSecretaryFeeIls),
    smsQuotaPerMonth: String(plan.smsQuotaPerMonth),
    aiTierIncluded: plan.aiTierIncluded ?? "NONE",
    aiAddonDiscountPercent: num(plan.aiAddonDiscountPercent),
    maxTherapists: num(plan.maxTherapists),
    maxSecretaries: num(plan.maxSecretaries),
    description: plan.description ?? "",
  };
}

function formToPayload(form: PlanFormState) {
  const numOrNull = (v: string): number | null => {
    if (v === "" || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  return {
    name: form.name.trim(),
    internalCode: form.internalCode.trim().toUpperCase(),
    isActive: form.isActive,
    isDefault: form.isDefault,
    baseFeeIls: Number(form.baseFeeIls) || 0,
    includedTherapists: Number(form.includedTherapists) || 1,
    perTherapistFeeIls: Number(form.perTherapistFeeIls) || 0,
    volumeDiscountAtCount: numOrNull(form.volumeDiscountAtCount),
    perTherapistAtVolumeIls: numOrNull(form.perTherapistAtVolumeIls),
    freeSecretaries: Number(form.freeSecretaries) || 0,
    perSecretaryFeeIls: numOrNull(form.perSecretaryFeeIls),
    smsQuotaPerMonth: Number(form.smsQuotaPerMonth) || 0,
    aiTierIncluded: form.aiTierIncluded === "NONE" ? null : form.aiTierIncluded,
    aiAddonDiscountPercent: numOrNull(form.aiAddonDiscountPercent),
    maxTherapists: numOrNull(form.maxTherapists),
    maxSecretaries: numOrNull(form.maxSecretaries),
    description: form.description.trim() || null,
  };
}

export default function ClinicPlansPage() {
  const [plans, setPlans] = useState<ClinicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clinic-plans");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPlans(data);
    } catch {
      toast.error("שגיאה בטעינת תוכניות התמחור");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(plan: ClinicPlan) {
    setEditingId(plan.id);
    setForm(planToForm(plan));
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.internalCode.trim()) {
      toast.error("נדרש שם וקוד פנימי");
      return;
    }
    if (Number(form.baseFeeIls) < 0 || Number(form.perTherapistFeeIls) < 0) {
      toast.error("מחירים חייבים להיות אי-שליליים");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/clinic-plans/${editingId}`
        : "/api/admin/clinic-plans";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success(editingId ? "התוכנית עודכנה" : "התוכנית נוצרה");
      setDialogOpen(false);
      fetchPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/admin/clinic-plans/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("התוכנית נמחקה");
      setDeleteId(null);
      fetchPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה במחיקה");
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <DollarSign className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">תוכניות תמחור לקליניקה</h1>
            <p className="text-sm text-muted-foreground">
              ניהול תוכניות מנוי ל-Organizations רב-מטפלים
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="ml-2 h-4 w-4" />
          תוכנית חדשה
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">אין תוכניות תמחור עדיין</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              צור את התוכנית הראשונה שלך כדי שניתן יהיה ליצור קליניקות חדשות.
            </p>
            <Button onClick={openCreate}>
              <Plus className="ml-2 h-4 w-4" />
              צור תוכנית
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {plan.name}
                      {plan.isDefault && (
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      )}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">
                      {plan.internalCode}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {plan.isActive ? (
                      <Badge className="bg-green-500/20 text-green-400">פעיל</Badge>
                    ) : (
                      <Badge variant="secondary">לא פעיל</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {plan._count.organizations} קליניקות
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">מחיר בסיס</p>
                    <p className="font-bold text-lg">
                      {Number(plan.baseFeeIls).toLocaleString("he-IL")} ₪
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">לכל מטפל מעבר ל-{plan.includedTherapists}</p>
                    <p className="font-bold text-lg">
                      {Number(plan.perTherapistFeeIls).toLocaleString("he-IL")} ₪
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                  <div>
                    <span>SMS לחודש: </span>
                    <span className="font-medium text-foreground">
                      {plan.smsQuotaPerMonth.toLocaleString("he-IL")}
                    </span>
                  </div>
                  <div>
                    <span>מזכירות חינם: </span>
                    <span className="font-medium text-foreground">
                      {plan.freeSecretaries}
                    </span>
                  </div>
                  {plan.volumeDiscountAtCount !== null && (
                    <div className="col-span-2">
                      <span>הנחת נפח מ-{plan.volumeDiscountAtCount} מטפלים: </span>
                      <span className="font-medium text-foreground">
                        {Number(plan.perTherapistAtVolumeIls).toLocaleString("he-IL")} ₪/מטפל
                      </span>
                    </div>
                  )}
                  {plan.aiTierIncluded && (
                    <div>
                      <span>AI כלול: </span>
                      <span className="font-medium text-foreground">{plan.aiTierIncluded}</span>
                    </div>
                  )}
                </div>

                {plan.description && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2">
                    {plan.description}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(plan)}
                  >
                    <Pencil className="ml-2 h-3.5 w-3.5" />
                    עריכה
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteId(plan.id)}
                    disabled={plan._count.organizations > 0}
                    title={
                      plan._count.organizations > 0
                        ? "לא ניתן למחוק תוכנית שיש קליניקות שמצביעות עליה"
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "עריכת תוכנית תמחור" : "תוכנית תמחור חדשה"}
            </DialogTitle>
            <DialogDescription>
              קליניקות יוכלו להירשם לתוכנית זו או לקבל חוזה מותאם אישית שגובר עליה.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>שם תוכנית *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="תוכנית קליניקה רגילה"
              />
            </div>
            <div className="space-y-2">
              <Label>קוד פנימי *</Label>
              <Input
                value={form.internalCode}
                onChange={(e) => setForm({ ...form, internalCode: e.target.value })}
                placeholder="CLINIC_STANDARD"
                className="font-mono"
                disabled={!!editingId}
              />
            </div>

            <div className="space-y-2">
              <Label>מחיר בסיס לחודש (₪) *</Label>
              <Input
                type="number"
                min={0}
                value={form.baseFeeIls}
                onChange={(e) => setForm({ ...form, baseFeeIls: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>מטפלים כלולים במחיר הבסיס</Label>
              <Input
                type="number"
                min={1}
                value={form.includedTherapists}
                onChange={(e) => setForm({ ...form, includedTherapists: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>מחיר לכל מטפל נוסף (₪) *</Label>
              <Input
                type="number"
                min={0}
                value={form.perTherapistFeeIls}
                onChange={(e) => setForm({ ...form, perTherapistFeeIls: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>מקסימום מטפלים (ריק = ללא הגבלה)</Label>
              <Input
                type="number"
                min={0}
                value={form.maxTherapists}
                onChange={(e) => setForm({ ...form, maxTherapists: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>הנחת נפח מ-X מטפלים (ריק = ללא)</Label>
              <Input
                type="number"
                min={0}
                value={form.volumeDiscountAtCount}
                onChange={(e) => setForm({ ...form, volumeDiscountAtCount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>מחיר לכל מטפל בנפח (₪)</Label>
              <Input
                type="number"
                min={0}
                value={form.perTherapistAtVolumeIls}
                onChange={(e) => setForm({ ...form, perTherapistAtVolumeIls: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>מזכירות חינם</Label>
              <Input
                type="number"
                min={0}
                value={form.freeSecretaries}
                onChange={(e) => setForm({ ...form, freeSecretaries: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>מחיר למזכירה נוספת (₪, ריק = ללא חיוב)</Label>
              <Input
                type="number"
                min={0}
                value={form.perSecretaryFeeIls}
                onChange={(e) => setForm({ ...form, perSecretaryFeeIls: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>מכסת SMS חודשית</Label>
              <Input
                type="number"
                min={0}
                value={form.smsQuotaPerMonth}
                onChange={(e) => setForm({ ...form, smsQuotaPerMonth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>תוכנית AI כלולה</Label>
              <Select
                value={form.aiTierIncluded}
                onValueChange={(v) =>
                  setForm({ ...form, aiTierIncluded: v as PlanFormState["aiTierIncluded"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">לא כלול</SelectItem>
                  <SelectItem value="ESSENTIAL">ESSENTIAL</SelectItem>
                  <SelectItem value="PRO">PRO</SelectItem>
                  <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>תיאור (אופציונלי)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="לקליניקות בינוניות עם 2-10 מטפלים..."
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-4 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                פעיל (זמין להקצאה לקליניקות חדשות)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                />
                ברירת מחדל ביצירת קליניקה חדשה
              </label>
            </div>
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
            <AlertDialogTitle>מחיקת תוכנית תמחור?</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו אינה הפיכה. אם יש קליניקות שמצביעות על התוכנית, המחיקה תיכשל.
              עדיף לסמן כלא-פעיל במקום למחוק.
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
