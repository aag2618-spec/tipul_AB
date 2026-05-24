"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
import { DollarSign, Plus, Loader2, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type AITier = "ESSENTIAL" | "PRO" | "ENTERPRISE";
type PricingScope = "GLOBAL" | "ORGANIZATION" | "CLINIC_MEMBER" | "USER";
type PackageType = "SMS" | "AI_DETAILED_ANALYSIS";

interface PricingPolicy {
  id: string;
  scope: PricingScope;
  organizationId: string | null;
  userId: string | null;
  planTier: AITier;
  monthlyIls: string | number;
  quarterlyIls: string | number | null;
  halfYearIls: string | number | null;
  yearlyIls: string | number | null;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
  createdBy: { id: string; name: string | null } | null;
  organization: { id: string; name: string } | null;
  targetUser: { id: string; name: string | null; email: string | null } | null;
}

interface PackagePolicy {
  id: string;
  scope: PricingScope;
  organizationId: string | null;
  userId: string | null;
  packageType: PackageType;
  credits: number;
  priceIls: string | number;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
  createdBy: { id: string; name: string | null } | null;
  organization: { id: string; name: string } | null;
  targetUser: { id: string; name: string | null; email: string | null } | null;
}

const SCOPE_LABELS: Record<PricingScope, string> = {
  GLOBAL: "כללי",
  ORGANIZATION: "קליניקה",
  CLINIC_MEMBER: "מטפלת בקליניקה",
  USER: "משתמש בודד",
};

const TIER_LABELS: Record<AITier, string> = {
  ESSENTIAL: "בסיסי",
  PRO: "מקצועי",
  ENTERPRISE: "ארגוני",
};

const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  SMS: "SMS",
  AI_DETAILED_ANALYSIS: "ניתוח מפורט",
};

function formatIls(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return `₪${n.toLocaleString("he-IL")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "ללא הגבלה";
  return new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}

// ============================================================================
// Subscription Policies
// ============================================================================

function SubscriptionPoliciesTab() {
  const [policies, setPolicies] = useState<PricingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [expireTarget, setExpireTarget] = useState<PricingPolicy | null>(null);
  const [form, setForm] = useState({
    scope: "GLOBAL" as PricingScope,
    organizationId: "",
    userId: "",
    planTier: "PRO" as AITier,
    monthlyIls: "",
    quarterlyIls: "",
    halfYearIls: "",
    yearlyIls: "",
    validFrom: "",
    validUntil: "",
    notes: "",
  });

  const handleScopeChange = (scope: PricingScope) => {
    // ניקוי IDs לא רלוונטיים בעת שינוי scope
    setForm((prev) => ({
      ...prev,
      scope,
      organizationId:
        scope === "ORGANIZATION" || scope === "CLINIC_MEMBER" ? prev.organizationId : "",
      userId: scope === "USER" || scope === "CLINIC_MEMBER" ? prev.userId : "",
    }));
  };

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeOnly
        ? "/api/admin/pricing/policies?activeOnly=true"
        : "/api/admin/pricing/policies";
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      setPolicies(await res.json());
    } catch {
      toast.error("שגיאה בטעינת מדיניות התמחור");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    void fetchPolicies();
  }, [fetchPolicies]);

  const handleCreate = async () => {
    const monthly = Number(form.monthlyIls);
    if (!form.monthlyIls || Number.isNaN(monthly) || monthly < 0) {
      toast.error("יש להזין מחיר חודשי תקין");
      return;
    }
    if (monthly === 0) {
      const confirmFree = window.confirm(
        "המחיר החודשי שהזנת הוא 0 ש\"ח — המנוי יהיה חינמי. להמשיך?"
      );
      if (!confirmFree) return;
    }
    setSaving(true);
    try {
      const payload = {
        scope: form.scope,
        organizationId: form.organizationId.trim() || null,
        userId: form.userId.trim() || null,
        planTier: form.planTier,
        monthlyIls: monthly,
        quarterlyIls: form.quarterlyIls ? Number(form.quarterlyIls) : null,
        halfYearIls: form.halfYearIls ? Number(form.halfYearIls) : null,
        yearlyIls: form.yearlyIls ? Number(form.yearlyIls) : null,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch("/api/admin/pricing/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "שגיאה");
      }
      toast.success("מדיניות תמחור נוצרה");
      setDialogOpen(false);
      setForm({
        scope: "GLOBAL",
        organizationId: "",
        userId: "",
        planTier: "PRO",
        monthlyIls: "",
        quarterlyIls: "",
        halfYearIls: "",
        yearlyIls: "",
        validFrom: "",
        validUntil: "",
        notes: "",
      });
      void fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירה");
    } finally {
      setSaving(false);
    }
  };

  const confirmExpire = async () => {
    if (!expireTarget) return;
    const id = expireTarget.id;
    setExpireTarget(null);
    try {
      const res = await fetch(`/api/admin/pricing/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntil: new Date().toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "שגיאה");
      }
      toast.success("תוקף המדיניות הסתיים");
      void fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בסיום תוקף");
    }
  };

  const now = Date.now();

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              מדיניות תמחור מנויים
            </CardTitle>
            <CardDescription>
              מחיר גלובלי, פר-קליניקה, פר-מטפלת או פר-משתמש. סדר עדיפויות:
              משתמש → מטפלת → קליניקה → גלובלי → ברירת מחדל מהקוד.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="active-only-sub"
                checked={activeOnly}
                onCheckedChange={setActiveOnly}
              />
              <Label htmlFor="active-only-sub" className="text-sm cursor-pointer">
                רק פעילים
              </Label>
            </div>
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 ml-1" />
              הוסף מדיניות
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : policies.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            אין מדיניות תמחור פעילה — המערכת תשתמש בברירת המחדל מהקוד.
          </p>
        ) : (
          <div className="space-y-2">
            {policies.map((p) => {
              const validFromMs = new Date(p.validFrom).getTime();
              const validUntilMs = p.validUntil ? new Date(p.validUntil).getTime() : null;
              const isActive =
                validFromMs <= now && (validUntilMs === null || validUntilMs > now);
              const isFuture = validFromMs > now;
              return (
                <div
                  key={p.id}
                  className="flex items-start justify-between border rounded-md p-3"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{SCOPE_LABELS[p.scope]}</Badge>
                      <Badge variant="secondary">{TIER_LABELS[p.planTier]}</Badge>
                      {isActive && (
                        <Badge className="bg-green-600 text-white">
                          <CheckCircle2 className="h-3 w-3 ml-1" />
                          פעיל עכשיו
                        </Badge>
                      )}
                      {isFuture && (
                        <Badge variant="outline" className="text-amber-600">
                          עתידי
                        </Badge>
                      )}
                      {!isActive && !isFuture && (
                        <Badge variant="outline" className="text-muted-foreground">
                          פג תוקף
                        </Badge>
                      )}
                      {p.organization && (
                        <span className="text-xs text-muted-foreground">
                          קליניקה: {p.organization.name}
                        </span>
                      )}
                      {p.targetUser && (
                        <span className="text-xs text-muted-foreground">
                          משתמש: {p.targetUser.name || p.targetUser.email}
                        </span>
                      )}
                    </div>
                    <div className="text-sm">
                      <strong>{formatIls(p.monthlyIls)}</strong> לחודש
                      {p.quarterlyIls && ` · ${formatIls(p.quarterlyIls)} לרבעון`}
                      {p.halfYearIls && ` · ${formatIls(p.halfYearIls)} לחצי שנה`}
                      {p.yearlyIls && ` · ${formatIls(p.yearlyIls)} לשנה`}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        מ-{formatDate(p.validFrom)} עד {formatDate(p.validUntil)}
                      </span>
                      {p.createdBy && (
                        <span>נוצר ע״י: {p.createdBy.name || "—"}</span>
                      )}
                    </div>
                    {p.notes && (
                      <p className="text-xs text-muted-foreground italic">{p.notes}</p>
                    )}
                  </div>
                  {!p.validUntil && isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpireTarget(p)}
                    >
                      סיים תוקף
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>מדיניות תמחור מנוי חדשה</DialogTitle>
            <DialogDescription>
              המחיר החדש יחול מהתאריך &quot;תקף מ-&quot; והלאה. מנויים פעילים ממשיכים
              במחיר הישן עד החיוב הבא. שמירת מדיניות חדשה לא מסיימת את הקיימת —
              שתיהן יישמרו להיסטוריה, והטרייה תקבע.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>היקף</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => handleScopeChange(v as PricingScope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCOPE_LABELS) as PricingScope[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCOPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(form.scope === "ORGANIZATION" || form.scope === "CLINIC_MEMBER") && (
              <div>
                <Label>מזהה קליניקה</Label>
                <Input
                  value={form.organizationId}
                  onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                  dir="ltr"
                  placeholder="מזהה הקליניקה (העתק/י מ-/admin/clinics)"
                />
              </div>
            )}
            {(form.scope === "USER" || form.scope === "CLINIC_MEMBER") && (
              <div>
                <Label>מזהה משתמש</Label>
                <Input
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  dir="ltr"
                  placeholder="מזהה המשתמש (העתק/י מ-/admin/users)"
                />
              </div>
            )}

            <div>
              <Label>רמת תוכנית</Label>
              <Select
                value={form.planTier}
                onValueChange={(v) => setForm({ ...form, planTier: v as AITier })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIER_LABELS) as AITier[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>חודשי ₪ *</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.monthlyIls}
                  onChange={(e) => setForm({ ...form, monthlyIls: e.target.value })}
                />
              </div>
              <div>
                <Label>3 חודשים ₪</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.quarterlyIls}
                  onChange={(e) => setForm({ ...form, quarterlyIls: e.target.value })}
                  placeholder="ריק = ×3 × 0.95 (הנחה 5%)"
                />
              </div>
              <div>
                <Label>6 חודשים ₪</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.halfYearIls}
                  onChange={(e) => setForm({ ...form, halfYearIls: e.target.value })}
                  placeholder="ריק = ×6 × 0.9 (הנחה 10%)"
                />
              </div>
              <div>
                <Label>שנתי ₪</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.yearlyIls}
                  onChange={(e) => setForm({ ...form, yearlyIls: e.target.value })}
                  placeholder="ריק = ×10 (חיסכון חודשיים)"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              שדות תקופות שיישארו ריקים יקבלו הנחה אוטומטית סטנדרטית (5%/10%/17%).
              למניעת הנחה — מילא ידנית את הסכום המלא (למשל ×12 לשנתי).
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>תקף מ-</Label>
                <Input
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ריק = חל מיד
                </p>
              </div>
              <div>
                <Label>תקף עד (לא חובה)</Label>
                <Input
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ריק = ללא הגבלת זמן
                </p>
              </div>
            </div>

            <div>
              <Label>הערות</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="למשל: הנחה לחברה X לפי חוזה"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={expireTarget !== null}
        onOpenChange={(o) => !o && setExpireTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לסיים תוקף עכשיו?</AlertDialogTitle>
            <AlertDialogDescription>
              המדיניות לא תיעלם — היא תישמר להיסטוריה, אבל תפסיק להשפיע על חישוב
              חיובים החל מהרגע הזה. ניתן יהיה לראות אותה ברשימה עם הסטטוס &quot;פג
              תוקף&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmExpire()}>
              סיים תוקף
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============================================================================
// Package Policies
// ============================================================================

function PackagePoliciesTab() {
  const [policies, setPolicies] = useState<PackagePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [expireTarget, setExpireTarget] = useState<PackagePolicy | null>(null);
  const [form, setForm] = useState({
    scope: "GLOBAL" as PricingScope,
    organizationId: "",
    userId: "",
    packageType: "SMS" as PackageType,
    credits: "",
    priceIls: "",
    validFrom: "",
    validUntil: "",
    notes: "",
  });

  const handleScopeChange = (scope: PricingScope) => {
    setForm((prev) => ({
      ...prev,
      scope,
      organizationId:
        scope === "ORGANIZATION" || scope === "CLINIC_MEMBER" ? prev.organizationId : "",
      userId: scope === "USER" || scope === "CLINIC_MEMBER" ? prev.userId : "",
    }));
  };

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeOnly
        ? "/api/admin/pricing/package-policies?activeOnly=true"
        : "/api/admin/pricing/package-policies";
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      setPolicies(await res.json());
    } catch {
      toast.error("שגיאה בטעינת מדיניות חבילות");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    void fetchPolicies();
  }, [fetchPolicies]);

  const confirmExpire = async () => {
    if (!expireTarget) return;
    const id = expireTarget.id;
    setExpireTarget(null);
    try {
      const res = await fetch(`/api/admin/pricing/package-policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntil: new Date().toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "שגיאה");
      }
      toast.success("תוקף המדיניות הסתיים");
      void fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בסיום תוקף");
    }
  };

  const handleCreate = async () => {
    if (!form.credits || Number(form.credits) <= 0) {
      toast.error("יש להזין כמות תקינה");
      return;
    }
    const price = Number(form.priceIls);
    if (!form.priceIls || Number.isNaN(price) || price < 0) {
      toast.error("יש להזין מחיר תקין");
      return;
    }
    if (price === 0) {
      const confirmFree = window.confirm(
        "המחיר שהזנת הוא 0 ש\"ח — החבילה תהיה חינמית. להמשיך?"
      );
      if (!confirmFree) return;
    }
    setSaving(true);
    try {
      const payload = {
        scope: form.scope,
        organizationId: form.organizationId.trim() || null,
        userId: form.userId.trim() || null,
        packageType: form.packageType,
        credits: Number(form.credits),
        priceIls: price,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch("/api/admin/pricing/package-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "שגיאה");
      }
      toast.success("מדיניות תמחור חבילה נוצרה");
      setDialogOpen(false);
      setForm({
        scope: "GLOBAL",
        organizationId: "",
        userId: "",
        packageType: "SMS",
        credits: "",
        priceIls: "",
        validFrom: "",
        validUntil: "",
        notes: "",
      });
      void fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירה");
    } finally {
      setSaving(false);
    }
  };

  const now = Date.now();

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              מדיניות תמחור חבילות (SMS / ניתוח מפורט)
            </CardTitle>
            <CardDescription>
              חבילות חד-פעמיות. ניתן להגדיר מחיר שונה פר-קליניקה או פר-משתמש.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="active-only-pkg"
                checked={activeOnly}
                onCheckedChange={setActiveOnly}
              />
              <Label htmlFor="active-only-pkg" className="text-sm cursor-pointer">
                רק פעילים
              </Label>
            </div>
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 ml-1" />
              הוסף מדיניות
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : policies.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            אין מדיניות חבילות. ניתן ליצור מדיניות גלובלית או ספציפית למשתמש/קליניקה.
          </p>
        ) : (
          <div className="space-y-2">
            {policies.map((p) => {
              const validFromMs = new Date(p.validFrom).getTime();
              const validUntilMs = p.validUntil ? new Date(p.validUntil).getTime() : null;
              const isActive =
                validFromMs <= now && (validUntilMs === null || validUntilMs > now);
              const isFuture = validFromMs > now;
              return (
                <div
                  key={p.id}
                  className="flex items-start justify-between border rounded-md p-3"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{SCOPE_LABELS[p.scope]}</Badge>
                      <Badge variant="secondary">
                        {PACKAGE_TYPE_LABELS[p.packageType]}
                      </Badge>
                      <Badge variant="outline">{p.credits} יחידות</Badge>
                      {isActive && (
                        <Badge className="bg-green-600 text-white">
                          <CheckCircle2 className="h-3 w-3 ml-1" />
                          פעיל עכשיו
                        </Badge>
                      )}
                      {isFuture && (
                        <Badge variant="outline" className="text-amber-600">
                          עתידי
                        </Badge>
                      )}
                      {!isActive && !isFuture && (
                        <Badge variant="outline" className="text-muted-foreground">
                          פג תוקף
                        </Badge>
                      )}
                      {p.organization && (
                        <span className="text-xs text-muted-foreground">
                          קליניקה: {p.organization.name}
                        </span>
                      )}
                      {p.targetUser && (
                        <span className="text-xs text-muted-foreground">
                          משתמש: {p.targetUser.name || p.targetUser.email}
                        </span>
                      )}
                    </div>
                    <div className="text-sm">
                      <strong>{formatIls(p.priceIls)}</strong> לחבילה
                    </div>
                    <div className="text-xs text-muted-foreground">
                      מ-{formatDate(p.validFrom)} עד {formatDate(p.validUntil)}
                    </div>
                    {p.notes && (
                      <p className="text-xs text-muted-foreground italic">{p.notes}</p>
                    )}
                  </div>
                  {!p.validUntil && isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpireTarget(p)}
                    >
                      סיים תוקף
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>מדיניות תמחור חבילה חדשה</DialogTitle>
            <DialogDescription>
              המחיר החדש יחול מהתאריך &quot;תקף מ-&quot; והלאה. רכישות שכבר בוצעו לא
              מושפעות. שמירת מדיניות חדשה לא מסיימת את הקיימת — הטרייה תקבע.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>היקף</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => handleScopeChange(v as PricingScope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCOPE_LABELS) as PricingScope[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCOPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(form.scope === "ORGANIZATION" || form.scope === "CLINIC_MEMBER") && (
              <div>
                <Label>מזהה קליניקה</Label>
                <Input
                  value={form.organizationId}
                  onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                  dir="ltr"
                  placeholder="מזהה הקליניקה (העתק/י מ-/admin/clinics)"
                />
              </div>
            )}
            {(form.scope === "USER" || form.scope === "CLINIC_MEMBER") && (
              <div>
                <Label>מזהה משתמש</Label>
                <Input
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  dir="ltr"
                  placeholder="מזהה המשתמש (העתק/י מ-/admin/users)"
                />
              </div>
            )}

            <div>
              <Label>סוג חבילה</Label>
              <Select
                value={form.packageType}
                onValueChange={(v) =>
                  setForm({ ...form, packageType: v as PackageType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PACKAGE_TYPE_LABELS) as PackageType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {PACKAGE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>כמות יחידות *</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: e.target.value })}
                />
              </div>
              <div>
                <Label>מחיר ₪ *</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.priceIls}
                  onChange={(e) => setForm({ ...form, priceIls: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>תקף מ-</Label>
                <Input
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ריק = חל מיד
                </p>
              </div>
              <div>
                <Label>תקף עד</Label>
                <Input
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ריק = ללא הגבלת זמן
                </p>
              </div>
            </div>

            <div>
              <Label>הערות</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={expireTarget !== null}
        onOpenChange={(o) => !o && setExpireTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לסיים תוקף עכשיו?</AlertDialogTitle>
            <AlertDialogDescription>
              המדיניות לא תיעלם — תישמר להיסטוריה ותפסיק להשפיע על תמחור החבילה
              מהרגע הזה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmExpire()}>
              סיים תוקף
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function PricingPoliciesPage() {
  return (
    <div className="container mx-auto py-6 space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">מדיניות תמחור גמיש</h1>
        <p className="text-sm text-muted-foreground">
          סדר עדיפויות בעת חישוב מחיר: משתמש → מטפלת בקליניקה → קליניקה → כללי →
          ברירת מחדל מהקוד.
        </p>
      </div>

      <Tabs defaultValue="subscriptions" dir="rtl">
        <TabsList>
          <TabsTrigger value="subscriptions">מנויים</TabsTrigger>
          <TabsTrigger value="packages">חבילות SMS/AI</TabsTrigger>
        </TabsList>
        <TabsContent value="subscriptions">
          <SubscriptionPoliciesTab />
        </TabsContent>
        <TabsContent value="packages">
          <PackagePoliciesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
