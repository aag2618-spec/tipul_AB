"use client";

import { useEffect, useState, useCallback, use } from "react";
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
  AlertCircle,
  Save,
  Users,
  Search,
  Check,
  X,
  Crown,
} from "lucide-react";
import { toast } from "sonner";

type AITier = "ESSENTIAL" | "PRO" | "ENTERPRISE";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";

interface PricingPlan {
  id: string;
  name: string;
  internalCode: string;
  isActive: boolean;
}

interface OwnerCandidate {
  id: string;
  name: string | null;
  email: string;
  role: string;
  organizationId: string | null;
}

interface ClinicData {
  id: string;
  name: string;
  businessName: string | null;
  businessIdNumber: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  logoUrl: string | null;
  ownerUserId: string;
  ownerIsTherapist: boolean;
  aiTier: AITier;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  owner: { id: string; name: string | null; email: string; role: string };
  pricingPlan: { id: string; name: string };
}

function isoToInputDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function EditClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [original, setOriginal] = useState<ClinicData | null>(null);

  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessIdNumber, setBusinessIdNumber] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [pricingPlanId, setPricingPlanId] = useState("");
  const [aiTier, setAiTier] = useState<AITier>("ESSENTIAL");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("TRIALING");
  const [subscriptionStartedAt, setSubscriptionStartedAt] = useState("");
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState("");
  const [ownerIsTherapist, setOwnerIsTherapist] = useState(false);

  // העברת בעלות
  const [transferOwnership, setTransferOwnership] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerCandidates, setOwnerCandidates] = useState<OwnerCandidate[]>([]);
  const [ownerSearching, setOwnerSearching] = useState(false);
  const [newOwner, setNewOwner] = useState<OwnerCandidate | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clinicRes, plansRes] = await Promise.all([
        fetch(`/api/admin/clinics/${id}`),
        fetch("/api/admin/clinic-plans"),
      ]);

      if (!clinicRes.ok) {
        if (clinicRes.status === 404) {
          setError("הקליניקה לא נמצאה");
        } else {
          setError("שגיאה בטעינת הקליניקה");
        }
        return;
      }

      const clinic: ClinicData = await clinicRes.json();
      setOriginal(clinic);

      setName(clinic.name);
      setBusinessName(clinic.businessName ?? "");
      setBusinessIdNumber(clinic.businessIdNumber ?? "");
      setBusinessAddress(clinic.businessAddress ?? "");
      setBusinessPhone(clinic.businessPhone ?? "");
      setLogoUrl(clinic.logoUrl ?? "");
      setPricingPlanId(clinic.pricingPlan.id);
      setAiTier(clinic.aiTier);
      setSubscriptionStatus(clinic.subscriptionStatus);
      setSubscriptionStartedAt(isoToInputDate(clinic.subscriptionStartedAt));
      setSubscriptionEndsAt(isoToInputDate(clinic.subscriptionEndsAt));
      setOwnerIsTherapist(clinic.ownerIsTherapist);

      if (plansRes.ok) {
        const data: PricingPlan[] = await plansRes.json();
        setPlans(data.filter((p) => p.isActive || p.id === clinic.pricingPlan.id));
      }
    } catch {
      setError("שגיאה בטעינת הנתונים");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // חיפוש בעלים חדש
  const searchOwners = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setOwnerCandidates([]);
        return;
      }
      setOwnerSearching(true);
      try {
        const res = await fetch(
          `/api/admin/clinics/owner-candidates?q=${encodeURIComponent(q.trim())}&excludeOrgId=${id}`
        );
        if (res.ok) {
          const data = await res.json();
          // מסיר את ה-owner הנוכחי מהרשימה — אין טעם להעביר אליו
          setOwnerCandidates(data.filter((u: OwnerCandidate) => u.id !== original?.ownerUserId));
        }
      } catch {
        // ignore
      } finally {
        setOwnerSearching(false);
      }
    },
    [id, original?.ownerUserId]
  );

  useEffect(() => {
    if (newOwner) return;
    const t = setTimeout(() => searchOwners(ownerQuery), 250);
    return () => clearTimeout(t);
  }, [ownerQuery, newOwner, searchOwners]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("שם הקליניקה לא יכול להיות ריק");
      return;
    }
    if (transferOwnership && !newOwner) {
      toast.error("יש לבחור בעל/ת קליניקה חדש/ה");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        businessName: businessName.trim() || null,
        businessIdNumber: businessIdNumber.trim() || null,
        businessAddress: businessAddress.trim() || null,
        businessPhone: businessPhone.trim() || null,
        logoUrl: logoUrl.trim() || null,
        pricingPlanId,
        aiTier,
        subscriptionStatus,
        subscriptionStartedAt: subscriptionStartedAt || null,
        subscriptionEndsAt: subscriptionEndsAt || null,
        ownerIsTherapist,
      };
      if (transferOwnership && newOwner) {
        body.ownerUserId = newOwner.id;
      }

      const res = await fetch(`/api/admin/clinics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה בשמירה");
      }

      toast.success("השינויים נשמרו");
      router.push(`/admin/clinics/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !original) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/clinics">
            <ArrowRight className="ml-2 h-4 w-4" />
            חזרה לרשימה
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-medium">{error || "לא נמצאה קליניקה"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto" dir="rtl">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/clinics/${id}`}>
          <ArrowRight className="ml-2 h-4 w-4" />
          חזרה לתצוגת הקליניקה
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">עריכת קליניקה</h1>
          <p className="text-sm text-muted-foreground">{original.name}</p>
        </div>
      </div>

      {/* פרטים בסיסיים */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">פרטי קליניקה</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label>שם קליניקה *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>שם עסקי</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ח.פ. / עוסק</Label>
            <Input
              value={businessIdNumber}
              onChange={(e) => setBusinessIdNumber(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>כתובת עסק</Label>
            <Input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>טלפון עסק</Label>
            <Input
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>קישור ללוגו (URL)</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} dir="ltr" />
          </div>
        </CardContent>
      </Card>

      {/* תוכנית ומנוי */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">תוכנית ומנוי</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label>תוכנית תמחור</Label>
            <Select value={pricingPlanId} onValueChange={setPricingPlanId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {!p.isActive && "(לא פעילה)"}
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
                <SelectItem value="ESSENTIAL">ESSENTIAL</SelectItem>
                <SelectItem value="PRO">PRO</SelectItem>
                <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>סטטוס מנוי</Label>
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
                <SelectItem value="PAST_DUE">באיחור</SelectItem>
                <SelectItem value="PAUSED">מושהה</SelectItem>
                <SelectItem value="CANCELLED">מבוטל</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>תחילת מנוי</Label>
            <Input
              type="date"
              value={subscriptionStartedAt}
              onChange={(e) => setSubscriptionStartedAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>סיום מנוי</Label>
            <Input
              type="date"
              value={subscriptionEndsAt}
              onChange={(e) => setSubscriptionEndsAt(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* בעלים — תצוגה והעברה */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            בעלות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted/40 rounded-lg">
            <div className="text-xs text-muted-foreground">הבעלים הנוכחי/ת</div>
            <div className="font-medium mt-0.5">{original.owner.name || "—"}</div>
            <div className="text-xs text-muted-foreground">{original.owner.email}</div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={ownerIsTherapist}
              onChange={(e) => setOwnerIsTherapist(e.target.checked)}
            />
            הבעלים גם מטפל/ת (מקבל/ת מטופלים בעצמו/ה)
          </label>

          <div className="border-t border-border pt-4">
            {!transferOwnership ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransferOwnership(true)}
                className="text-amber-400 hover:text-amber-300"
              >
                <Users className="ml-2 h-3.5 w-3.5" />
                העברת בעלות למשתמש אחר
              </Button>
            ) : (
              <div className="space-y-3 p-3 border border-amber-500/30 bg-amber-500/5 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-amber-400">
                    העברת בעלות
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTransferOwnership(false);
                      setNewOwner(null);
                      setOwnerQuery("");
                      setOwnerCandidates([]);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  הבעלים החדש/ה צריך/ה להיות חבר/ה קיים/ת בקליניקה הזו או משתמש/ת לא משויך/ת
                  לארגון. הבעלים הקודם/ת יישאר/תישאר חבר/ה כמטפל/ת.
                </p>

                {newOwner ? (
                  <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">{newOwner.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{newOwner.email}</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setNewOwner(null)}>
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
                        placeholder="חיפוש לפי אימייל או שם..."
                        className="pr-9"
                      />
                      {ownerSearching && (
                        <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {ownerCandidates.length > 0 && (
                      <div className="border border-border rounded-lg overflow-hidden bg-background">
                        {ownerCandidates.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => setNewOwner(u)}
                            className="w-full text-right px-3 py-2 hover:bg-muted transition-colors border-b border-border last:border-0"
                          >
                            <div className="font-medium text-sm">{u.name || u.email}</div>
                            <div className="text-xs text-muted-foreground">
                              {u.email} •{" "}
                              {u.organizationId === id ? "חבר/ה בקליניקה" : "לא משויך/ת"}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" disabled={saving}>
          <Link href={`/admin/clinics/${id}`}>ביטול</Link>
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="ml-2 h-4 w-4" />
          )}
          שמור שינויים
        </Button>
      </div>
    </div>
  );
}
