"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileSignature,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Building2,
  AlertCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type AITier = "ESSENTIAL" | "PRO" | "ENTERPRISE";
type ContractStatus = "all" | "active" | "expiring" | "expired" | "future";

interface OrgSummary {
  id: string;
  name: string;
  customContract: { id: string } | null;
}

interface CustomContract {
  id: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    owner: { id: string; name: string | null; email: string };
    pricingPlan: { name: string; internalCode: string };
  };
  monthlyEquivPriceIls: string | number;
  billingCycleMonths: number;
  customSmsQuota: number | null;
  customAiTier: AITier | null;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  renewalMonths: number;
  annualIncreasePct: string | number | null;
  signedDocumentUrl: string | null;
  notes: string | null;
  createdBy: { id: string; name: string | null; email: string };
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  organizationId: string;
  monthlyEquivPriceIls: string;
  billingCycleMonths: string;
  customSmsQuota: string;
  customAiTier: AITier | "NONE";
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  renewalMonths: string;
  annualIncreasePct: string;
  signedDocumentUrl: string;
  notes: string;
}

const todayISO = (): string => new Date().toISOString().slice(0, 10);
const isoOf = (iso: string): string => new Date(iso).toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  organizationId: "",
  monthlyEquivPriceIls: "0",
  billingCycleMonths: "1",
  customSmsQuota: "",
  customAiTier: "NONE",
  startDate: todayISO(),
  endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  autoRenew: false,
  renewalMonths: "12",
  annualIncreasePct: "",
  signedDocumentUrl: "",
  notes: "",
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDaysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function contractToForm(c: CustomContract): FormState {
  return {
    organizationId: c.organizationId,
    monthlyEquivPriceIls: String(c.monthlyEquivPriceIls),
    billingCycleMonths: String(c.billingCycleMonths),
    customSmsQuota: c.customSmsQuota === null ? "" : String(c.customSmsQuota),
    customAiTier: c.customAiTier ?? "NONE",
    startDate: isoOf(c.startDate),
    endDate: isoOf(c.endDate),
    autoRenew: c.autoRenew,
    renewalMonths: String(c.renewalMonths),
    annualIncreasePct: c.annualIncreasePct === null ? "" : String(c.annualIncreasePct),
    signedDocumentUrl: c.signedDocumentUrl ?? "",
    notes: c.notes ?? "",
  };
}

function formToPayload(f: FormState, isCreate: boolean) {
  const numOrNull = (v: string): number | null => {
    if (v === "" || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const payload: Record<string, unknown> = {
    monthlyEquivPriceIls: Number(f.monthlyEquivPriceIls) || 0,
    billingCycleMonths: Number(f.billingCycleMonths) || 1,
    customSmsQuota: numOrNull(f.customSmsQuota),
    customAiTier: f.customAiTier === "NONE" ? null : f.customAiTier,
    startDate: f.startDate,
    endDate: f.endDate,
    autoRenew: f.autoRenew,
    renewalMonths: Number(f.renewalMonths) || 12,
    annualIncreasePct: numOrNull(f.annualIncreasePct),
    signedDocumentUrl: f.signedDocumentUrl.trim() || null,
    notes: f.notes.trim() || null,
  };
  if (isCreate) {
    payload.organizationId = f.organizationId;
  }
  return payload;
}

export default function CustomContractsPage() {
  const [contracts, setContracts] = useState<CustomContract[]>([]);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ContractStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/custom-contracts?status=${statusFilter}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContracts(data);
    } catch {
      toast.error("שגיאה בטעינת חוזים");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clinics?limit=500");
      if (res.ok) {
        const data = await res.json();
        setOrgs(
          data.map((o: OrgSummary) => ({
            id: o.id,
            name: o.name,
            customContract: o.customContract,
          }))
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(c: CustomContract) {
    setEditingId(c.id);
    setForm(contractToForm(c));
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editingId && !form.organizationId) {
      toast.error("נדרש לבחור קליניקה");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("נדרש תאריך תחילה וסיום");
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      toast.error("תאריך סיום חייב להיות אחרי תאריך תחילה");
      return;
    }

    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/custom-contracts/${editingId}`
        : "/api/admin/custom-contracts";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form, !editingId)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success(editingId ? "החוזה עודכן" : "החוזה נוצר");
      setDialogOpen(false);
      fetchContracts();
      fetchOrgs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/admin/custom-contracts/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("החוזה נמחק");
      setDeleteId(null);
      fetchContracts();
      fetchOrgs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    }
  }

  // קליניקות שאין להן חוזה — זמינות ליצירה
  const eligibleOrgs = orgs.filter((o) => !o.customContract);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <FileSignature className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">חוזים מותאמים</h1>
            <p className="text-sm text-muted-foreground">
              חוזה מותאם פר-קליניקה — גובר על תוכנית התמחור הסטנדרטית
            </p>
          </div>
        </div>
        <Button onClick={openCreate} disabled={eligibleOrgs.length === 0}>
          <Plus className="ml-2 h-4 w-4" />
          חוזה חדש
        </Button>
      </div>

      {/* פילטר סטטוס */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "expiring", "expired", "future"] as ContractStatus[]).map(
              (s) => {
                const labels: Record<ContractStatus, string> = {
                  all: "הכל",
                  active: "פעילים",
                  expiring: "מסתיימים תוך 30 ימים",
                  expired: "פגי תוקף",
                  future: "עתידיים",
                };
                return (
                  <Button
                    key={s}
                    variant={statusFilter === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(s)}
                  >
                    {labels[s]}
                  </Button>
                );
              }
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : contracts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileSignature className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">
              {statusFilter === "all" ? "אין חוזים מותאמים" : "אין חוזים בסטטוס זה"}
            </p>
            {statusFilter === "all" && eligibleOrgs.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  צור/י חוזה ראשון לקליניקה (יש {eligibleOrgs.length} זמינות).
                </p>
                <Button onClick={openCreate}>
                  <Plus className="ml-2 h-4 w-4" />
                  צור חוזה
                </Button>
              </>
            )}
            {statusFilter === "all" && eligibleOrgs.length === 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                אין קליניקות במערכת. צור/י קליניקה תחילה.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {contracts.map((c) => {
            const days = getDaysUntil(c.endDate);
            const isExpired = days < 0;
            const isExpiring = days >= 0 && days <= 30;

            return (
              <Card
                key={c.id}
                className={isExpired ? "opacity-70 border-red-500/30" : isExpiring ? "border-amber-500/50" : ""}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/admin/clinics/${c.organization.id}`}
                        className="inline-flex items-center gap-1.5 hover:text-primary"
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-base truncate">
                          {c.organization.name}
                        </CardTitle>
                      </Link>
                      <p className="text-xs text-muted-foreground mt-1">
                        בעלים: {c.organization.owner.name || c.organization.owner.email}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {isExpired ? (
                        <Badge className="bg-red-500/20 text-red-400">פג</Badge>
                      ) : isExpiring ? (
                        <Badge className="bg-amber-500/20 text-amber-400">
                          <Clock className="ml-1 h-3 w-3" />
                          {days} ימים
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400">פעיל</Badge>
                      )}
                      {c.autoRenew && (
                        <Badge variant="secondary" className="text-[10px]">
                          חידוש אוטומטי
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">מחיר חודשי</p>
                      <p className="font-bold text-lg">
                        {Number(c.monthlyEquivPriceIls).toLocaleString("he-IL")} ₪
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">תוקף</p>
                      <p className="text-sm">
                        {formatDate(c.startDate)}
                        <br />
                        עד {formatDate(c.endDate)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border pt-2">
                    <div>
                      מחזור: <span className="text-foreground">{c.billingCycleMonths} חודשים</span>
                    </div>
                    {c.customSmsQuota !== null && (
                      <div>
                        SMS:{" "}
                        <span className="text-foreground">
                          {c.customSmsQuota.toLocaleString("he-IL")}
                        </span>
                      </div>
                    )}
                    {c.customAiTier && (
                      <div>
                        AI: <span className="text-foreground">{c.customAiTier}</span>
                      </div>
                    )}
                    {c.annualIncreasePct !== null && (
                      <div>
                        עליית מחיר:{" "}
                        <span className="text-foreground">
                          {Number(c.annualIncreasePct)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {c.notes && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2">
                      {c.notes}
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="ml-2 h-3.5 w-3.5" />
                      עריכה
                    </Button>
                    {c.signedDocumentUrl && (
                      <Button asChild variant="outline" size="sm">
                        <a href={c.signedDocumentUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog יצירה/עריכה */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "עריכת חוזה מותאם" : "חוזה מותאם חדש"}
            </DialogTitle>
            <DialogDescription>
              חוזה זה גובר על תוכנית התמחור הסטנדרטית של הקליניקה כל עוד הוא פעיל
              (startDate ≤ עכשיו &lt; endDate).
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {!editingId && (
              <div className="sm:col-span-2 space-y-2">
                <Label>קליניקה *</Label>
                <Select
                  value={form.organizationId}
                  onValueChange={(v) => setForm({ ...form, organizationId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר/י קליניקה" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOrgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eligibleOrgs.length === 0 && (
                  <p className="text-xs text-amber-400 inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    כל הקליניקות הקיימות כבר עם חוזה — מחק/י חוזה קיים כדי ליצור חדש
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>מחיר חודשי אפקטיבי (₪) *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.monthlyEquivPriceIls}
                onChange={(e) => setForm({ ...form, monthlyEquivPriceIls: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>מחזור חיוב (חודשים)</Label>
              <Input
                type="number"
                min={1}
                value={form.billingCycleMonths}
                onChange={(e) => setForm({ ...form, billingCycleMonths: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>תאריך תחילה *</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>תאריך סיום *</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>מכסת SMS מותאמת (ריק = לפי תוכנית)</Label>
              <Input
                type="number"
                min={0}
                value={form.customSmsQuota}
                onChange={(e) => setForm({ ...form, customSmsQuota: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>שכבת AI מותאמת</Label>
              <Select
                value={form.customAiTier}
                onValueChange={(v) =>
                  setForm({ ...form, customAiTier: v as FormState["customAiTier"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">לפי הגדרת הקליניקה</SelectItem>
                  <SelectItem value="ESSENTIAL">ESSENTIAL</SelectItem>
                  <SelectItem value="PRO">PRO</SelectItem>
                  <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>חודשי חידוש</Label>
              <Input
                type="number"
                min={1}
                value={form.renewalMonths}
                onChange={(e) => setForm({ ...form, renewalMonths: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>עליית מחיר שנתית (%)</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={form.annualIncreasePct}
                onChange={(e) => setForm({ ...form, annualIncreasePct: e.target.value })}
                placeholder="ריק = ללא"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>קישור ל-PDF חתום (אופציונלי)</Label>
              <Input
                value={form.signedDocumentUrl}
                onChange={(e) => setForm({ ...form, signedDocumentUrl: e.target.value })}
                dir="ltr"
                placeholder="https://..."
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>הערות (אופציונלי)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="sm:col-span-2 flex pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoRenew}
                  onChange={(e) => setForm({ ...form, autoRenew: e.target.checked })}
                />
                חידוש אוטומטי בסיום
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
            <AlertDialogTitle>מחיקת חוזה מותאם?</AlertDialogTitle>
            <AlertDialogDescription>
              אחרי המחיקה, הקליניקה תחזור לתמחור לפי ה-ClinicPricingPlan שלה.
              פעולה זו אינה הפיכה.
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
