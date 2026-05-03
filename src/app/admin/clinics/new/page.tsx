"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  ArrowRight,
  Loader2,
  Search,
  Check,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type AITier = "ESSENTIAL" | "PRO" | "ENTERPRISE";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";

interface PricingPlan {
  id: string;
  name: string;
  internalCode: string;
  isActive: boolean;
  isDefault: boolean;
  baseFeeIls: string | number;
  perTherapistFeeIls: string | number;
  includedTherapists: number;
  smsQuotaPerMonth: number;
  aiTierIncluded: AITier | null;
}

interface OwnerCandidate {
  id: string;
  name: string | null;
  email: string;
  role: string;
  organizationId: string | null;
}

export default function CreateClinicPage() {
  const router = useRouter();

  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessIdNumber, setBusinessIdNumber] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  const [pricingPlanId, setPricingPlanId] = useState<string>("");
  const [aiTier, setAiTier] = useState<AITier>("ESSENTIAL");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("TRIALING");

  // חיפוש בעלים
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerCandidates, setOwnerCandidates] = useState<OwnerCandidate[]>([]);
  const [ownerSearching, setOwnerSearching] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<OwnerCandidate | null>(null);
  const [ownerIsTherapist, setOwnerIsTherapist] = useState(false);

  const [saving, setSaving] = useState(false);

  // טעינת תוכניות
  useEffect(() => {
    (async () => {
      setPlansLoading(true);
      try {
        const res = await fetch("/api/admin/clinic-plans");
        if (!res.ok) throw new Error();
        const data: PricingPlan[] = await res.json();
        const active = data.filter((p) => p.isActive);
        setPlans(active);
        const def = active.find((p) => p.isDefault) || active[0];
        if (def) setPricingPlanId(def.id);
      } catch {
        toast.error("שגיאה בטעינת תוכניות תמחור");
      } finally {
        setPlansLoading(false);
      }
    })();
  }, []);

  // חיפוש בעלים מועמדים
  const searchOwners = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setOwnerCandidates([]);
      return;
    }
    setOwnerSearching(true);
    try {
      const res = await fetch(
        `/api/admin/clinics/owner-candidates?q=${encodeURIComponent(q.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setOwnerCandidates(data);
      }
    } catch {
      // ignore
    } finally {
      setOwnerSearching(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOwner) return;
    const t = setTimeout(() => searchOwners(ownerQuery), 250);
    return () => clearTimeout(t);
  }, [ownerQuery, selectedOwner, searchOwners]);

  function clearOwner() {
    setSelectedOwner(null);
    setOwnerQuery("");
    setOwnerCandidates([]);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("נדרש שם קליניקה");
      return;
    }
    if (!selectedOwner) {
      toast.error("נדרש לבחור בעל/ת קליניקה");
      return;
    }
    if (!pricingPlanId) {
      toast.error("נדרש לבחור תוכנית תמחור");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/clinics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ownerUserId: selectedOwner.id,
          pricingPlanId,
          ownerIsTherapist,
          businessIdNumber: businessIdNumber.trim() || undefined,
          businessName: businessName.trim() || undefined,
          businessAddress: businessAddress.trim() || undefined,
          businessPhone: businessPhone.trim() || undefined,
          aiTier,
          subscriptionStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה ביצירת הקליניקה");
      }

      const created = await res.json();
      toast.success("הקליניקה נוצרה בהצלחה");
      router.push(`/admin/clinics/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הקליניקה");
    } finally {
      setSaving(false);
    }
  }

  if (plansLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-medium">אין תוכניות תמחור פעילות במערכת</p>
            <p className="text-sm text-muted-foreground">
              לפני יצירת קליניקה, צריך להגדיר לפחות תוכנית תמחור פעילה אחת.
            </p>
            <Button asChild>
              <Link href="/admin/pricing/clinic-plans">צור תוכנית תמחור</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/clinics">
            <ArrowRight className="ml-2 h-4 w-4" />
            חזרה לרשימה
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">קליניקה חדשה</h1>
          <p className="text-sm text-muted-foreground">
            יצירת Organization חדש ושיוך בעל/ת קליניקה
          </p>
        </div>
      </div>

      {/* פרטי קליניקה */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">פרטי קליניקה</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label>שם קליניקה *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="קליניקת ד״ר כהן"
            />
          </div>
          <div className="space-y-2">
            <Label>שם עסקי (אופציונלי)</Label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="להופעה בקבלות"
            />
          </div>
          <div className="space-y-2">
            <Label>ח.פ. / עוסק (אופציונלי)</Label>
            <Input
              value={businessIdNumber}
              onChange={(e) => setBusinessIdNumber(e.target.value)}
              placeholder="123456789"
              className="font-mono"
            />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>כתובת עסק (אופציונלי)</Label>
            <Input
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>טלפון עסק (אופציונלי)</Label>
            <Input
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      {/* בחירת בעלים */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">בעל/ת קליניקה *</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedOwner ? (
            <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium">{selectedOwner.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{selectedOwner.email}</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearOwner}>
                החלף
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={ownerQuery}
                  onChange={(e) => setOwnerQuery(e.target.value)}
                  placeholder="חיפוש לפי אימייל או שם (לפחות 2 תווים)..."
                  className="pr-9"
                />
                {ownerSearching && (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {ownerCandidates.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  {ownerCandidates.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedOwner(u);
                        setOwnerCandidates([]);
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-muted transition-colors border-b border-border last:border-0"
                    >
                      <div className="font-medium text-sm">{u.name || u.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email} • {u.role}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {ownerQuery.trim().length >= 2 && !ownerSearching && ownerCandidates.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  לא נמצאו משתמשים זמינים. ייתכן שכבר משויכים לקליניקה אחרת.
                </p>
              )}
            </>
          )}

          {selectedOwner && (
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2 border-t border-border">
              <input
                type="checkbox"
                checked={ownerIsTherapist}
                onChange={(e) => setOwnerIsTherapist(e.target.checked)}
              />
              הבעלים גם מטפל/ת (מקבל/ת מטופלים בעצמו/ה)
            </label>
          )}
        </CardContent>
      </Card>

      {/* תוכנית ומנוי */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">תוכנית תמחור ומנוי</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label>תוכנית תמחור *</Label>
            <Select value={pricingPlanId} onValueChange={setPricingPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="בחר/י תוכנית" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({Number(p.baseFeeIls).toLocaleString("he-IL")} ₪ +{" "}
                    {Number(p.perTherapistFeeIls).toLocaleString("he-IL")} ₪/מטפל מעבר ל-
                    {p.includedTherapists})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>שכבת AI</Label>
            <Select value={aiTier} onValueChange={(v) => setAiTier(v as AITier)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ESSENTIAL">ESSENTIAL (ללא AI)</SelectItem>
                <SelectItem value="PRO">PRO (תמציתי)</SelectItem>
                <SelectItem value="ENTERPRISE">ENTERPRISE (מפורט)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>סטטוס מנוי התחלתי</Label>
            <Select
              value={subscriptionStatus}
              onValueChange={(v) => setSubscriptionStatus(v as SubscriptionStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TRIALING">ניסיון</SelectItem>
                <SelectItem value="ACTIVE">פעיל</SelectItem>
                <SelectItem value="PAUSED">מושהה</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" disabled={saving}>
          <Link href="/admin/clinics">ביטול</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          צור קליניקה
        </Button>
      </div>
    </div>
  );
}
