"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Plus,
  Loader2,
  Search,
  ExternalLink,
  Users,
  FileSignature,
} from "lucide-react";
import { toast } from "sonner";

type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";

interface Clinic {
  id: string;
  name: string;
  businessName: string | null;
  businessIdNumber: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  aiTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  createdAt: string;
  owner: { id: string; name: string | null; email: string };
  pricingPlan: { id: string; name: string; internalCode: string };
  customContract: { id: string; endDate: string; monthlyEquivPriceIls: string | number; autoRenew: boolean } | null;
  _count: { members: number; clients: number; therapySessions: number };
}

interface PricingPlanSummary {
  id: string;
  name: string;
  internalCode: string;
  isActive: boolean;
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: "פעיל",
  TRIALING: "ניסיון",
  PAST_DUE: "באיחור",
  CANCELLED: "מבוטל",
  PAUSED: "מושהה",
};

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  ACTIVE: "bg-green-500/20 text-green-400",
  TRIALING: "bg-blue-500/20 text-blue-400",
  PAST_DUE: "bg-amber-500/20 text-amber-400",
  CANCELLED: "bg-red-500/20 text-red-400",
  PAUSED: "bg-zinc-500/20 text-zinc-400",
};

export default function AdminClinicsListPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [plans, setPlans] = useState<PricingPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [planFilter, setPlanFilter] = useState<string>("ALL");

  const fetchClinics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (planFilter !== "ALL") params.set("planId", planFilter);

      const res = await fetch(`/api/admin/clinics?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setClinics(data);
    } catch {
      toast.error("שגיאה בטעינת רשימת הקליניקות");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter]);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clinic-plans");
      if (res.ok) {
        const data = await res.json();
        setPlans(data);
      }
    } catch {
      // לא קריטי — סינון לפי תוכנית פשוט לא יעבוד
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    const t = setTimeout(fetchClinics, 250);
    return () => clearTimeout(t);
  }, [fetchClinics]);

  const stats = useMemo(() => {
    const counts = { ACTIVE: 0, TRIALING: 0, PAST_DUE: 0, CANCELLED: 0, PAUSED: 0 } as Record<
      SubscriptionStatus,
      number
    >;
    clinics.forEach((c) => {
      counts[c.subscriptionStatus] = (counts[c.subscriptionStatus] || 0) + 1;
    });
    return counts;
  }, [clinics]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">קליניקות רב-מטפלים</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? "טוען..." : `${clinics.length} קליניקות במערכת`}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/clinics/new">
            <Plus className="ml-2 h-4 w-4" />
            קליניקה חדשה
          </Link>
        </Button>
      </div>

      {/* סטטיסטיקות מהירות */}
      {!loading && clinics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((s) => (
            <Card key={s} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</p>
                <p className="text-2xl font-bold mt-1">{stats[s]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* פילטרים */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם / ח.פ. / בעלים..."
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="סטטוס מנוי" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">כל הסטטוסים</SelectItem>
                {(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger>
                <SelectValue placeholder="תוכנית תמחור" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">כל התוכניות</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* טבלה */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : clinics.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">
              {search.trim() || statusFilter !== "ALL" || planFilter !== "ALL"
                ? "אין תוצאות לסינון הנוכחי"
                : "אין קליניקות במערכת"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {search.trim() || statusFilter !== "ALL" || planFilter !== "ALL"
                ? "נקה סינון או חפש משהו אחר"
                : "צור קליניקה ראשונה כדי להתחיל"}
            </p>
            {!search.trim() && statusFilter === "ALL" && planFilter === "ALL" && (
              <Button asChild>
                <Link href="/admin/clinics/new">
                  <Plus className="ml-2 h-4 w-4" />
                  צור קליניקה חדשה
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">רשימת קליניקות</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-right">
                    <th className="px-4 py-2 font-medium">שם</th>
                    <th className="px-4 py-2 font-medium">בעלים</th>
                    <th className="px-4 py-2 font-medium">תוכנית</th>
                    <th className="px-4 py-2 font-medium">חברים</th>
                    <th className="px-4 py-2 font-medium">מטופלים</th>
                    <th className="px-4 py-2 font-medium">סטטוס</th>
                    <th className="px-4 py-2 font-medium">חוזה</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {clinics.map((clinic) => (
                    <tr
                      key={clinic.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/clinics/${clinic.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {clinic.name}
                        </Link>
                        {clinic.businessIdNumber && (
                          <div className="text-xs text-muted-foreground font-mono">
                            ח.פ. {clinic.businessIdNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{clinic.owner.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{clinic.owner.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{clinic.pricingPlan.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {clinic.pricingPlan.internalCode}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {clinic._count.members}
                        </span>
                      </td>
                      <td className="px-4 py-3">{clinic._count.clients}</td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_BADGE[clinic.subscriptionStatus]}>
                          {STATUS_LABEL[clinic.subscriptionStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {clinic.customContract ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <FileSignature className="h-3.5 w-3.5" />
                            <span className="text-xs">חוזה מותאם</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/clinics/${clinic.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
