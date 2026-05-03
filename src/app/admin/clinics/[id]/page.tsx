"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  ArrowRight,
  Loader2,
  Pencil,
  Users,
  FileSignature,
  CreditCard,
  AlertCircle,
  Crown,
  Stethoscope,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";

type ClinicRole = "OWNER" | "THERAPIST" | "SECRETARY";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
  clinicRole: ClinicRole | null;
  isBlocked: boolean;
  createdAt: string;
}

interface ClinicDetail {
  id: string;
  name: string;
  businessName: string | null;
  businessIdNumber: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  logoUrl: string | null;
  ownerUserId: string;
  ownerIsTherapist: boolean;
  aiTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string | null; email: string; role: string; isBlocked: boolean };
  pricingPlan: {
    id: string;
    name: string;
    internalCode: string;
    baseFeeIls: string | number;
    perTherapistFeeIls: string | number;
    includedTherapists: number;
    smsQuotaPerMonth: number;
    aiTierIncluded: string | null;
  };
  customContract: {
    id: string;
    monthlyEquivPriceIls: string | number;
    billingCycleMonths: number;
    customSmsQuota: number | null;
    customAiTier: string | null;
    startDate: string;
    endDate: string;
    autoRenew: boolean;
    annualIncreasePct: string | number | null;
    notes: string | null;
    createdBy: { id: string; name: string | null; email: string };
  } | null;
  members: Member[];
  _count: {
    members: number;
    clients: number;
    therapySessions: number;
    payments: number;
    transferLogs: number;
    departures: number;
  };
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ClinicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [clinic, setClinic] = useState<ClinicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClinic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clinics/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("הקליניקה לא נמצאה");
        } else {
          setError("שגיאה בטעינת הקליניקה");
        }
        return;
      }
      const data = await res.json();
      setClinic(data);
    } catch {
      setError("שגיאה בטעינת הקליניקה");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClinic();
  }, [fetchClinic]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !clinic) {
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

  const owners = clinic.members.filter((m) => m.clinicRole === "OWNER");
  const therapists = clinic.members.filter((m) => m.clinicRole === "THERAPIST");
  const secretaries = clinic.members.filter((m) => m.clinicRole === "SECRETARY");

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/clinics">
            <ArrowRight className="ml-2 h-4 w-4" />
            חזרה לרשימה
          </Link>
        </Button>
        <Button asChild>
          <Link href={`/admin/clinics/${id}/edit`}>
            <Pencil className="ml-2 h-4 w-4" />
            עריכה
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{clinic.name}</h1>
            {clinic.businessName && (
              <p className="text-sm text-muted-foreground">{clinic.businessName}</p>
            )}
            {clinic.businessIdNumber && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                ח.פ. {clinic.businessIdNumber}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-start">
          <Badge className={STATUS_BADGE[clinic.subscriptionStatus]}>
            {STATUS_LABEL[clinic.subscriptionStatus]}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            AI: {clinic.aiTier}
          </Badge>
          {clinic.customContract && (
            <Badge className="bg-amber-500/20 text-amber-400 text-xs">
              <FileSignature className="ml-1 h-3 w-3" />
              חוזה מותאם
            </Badge>
          )}
        </div>
      </div>

      {/* סטטיסטיקות */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חברים</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              {clinic._count.members}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">מטופלים</p>
            <p className="text-2xl font-bold mt-1">{clinic._count.clients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">פגישות</p>
            <p className="text-2xl font-bold mt-1">{clinic._count.therapySessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">תשלומים</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              {clinic._count.payments}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* בעלים */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              בעלות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="font-medium">{clinic.owner.name || "—"}</p>
              <p className="text-xs text-muted-foreground">{clinic.owner.email}</p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
              <div>תפקיד גלובלי: <span className="text-foreground font-mono">{clinic.owner.role}</span></div>
              <div>
                גם מטפל/ת: {clinic.ownerIsTherapist ? "כן" : "לא (ניהול בלבד)"}
              </div>
              {clinic.owner.isBlocked && (
                <div className="text-red-400">⚠ המשתמש חסום</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* תמחור */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              תמחור
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="font-medium">{clinic.pricingPlan.name}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {clinic.pricingPlan.internalCode}
              </p>
            </div>
            <div className="text-sm space-y-1 pt-2 border-t border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">בסיס:</span>
                <span className="font-medium">
                  {Number(clinic.pricingPlan.baseFeeIls).toLocaleString("he-IL")} ₪
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  מטפל נוסף (מעבר ל-{clinic.pricingPlan.includedTherapists}):
                </span>
                <span className="font-medium">
                  {Number(clinic.pricingPlan.perTherapistFeeIls).toLocaleString("he-IL")} ₪
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SMS לחודש:</span>
                <span className="font-medium">
                  {clinic.pricingPlan.smsQuotaPerMonth.toLocaleString("he-IL")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* חוזה מותאם */}
      {clinic.customContract && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-amber-400" />
              חוזה מותאם — גובר על התוכנית
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">מחיר חודשי אפקטיבי</p>
              <p className="font-bold text-lg">
                {Number(clinic.customContract.monthlyEquivPriceIls).toLocaleString("he-IL")} ₪
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">מחזור חיוב</p>
              <p className="font-medium">{clinic.customContract.billingCycleMonths} חודשים</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">תאריך תחילה</p>
              <p className="font-medium">{formatDate(clinic.customContract.startDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">תאריך סיום</p>
              <p className="font-medium">{formatDate(clinic.customContract.endDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">חידוש אוטומטי</p>
              <p className="font-medium">
                {clinic.customContract.autoRenew ? "כן" : "לא"}
              </p>
            </div>
            {clinic.customContract.annualIncreasePct !== null && (
              <div>
                <p className="text-xs text-muted-foreground">עליית מחיר שנתית</p>
                <p className="font-medium">
                  {Number(clinic.customContract.annualIncreasePct)}%
                </p>
              </div>
            )}
            {clinic.customContract.customSmsQuota !== null && (
              <div>
                <p className="text-xs text-muted-foreground">מכסת SMS מותאמת</p>
                <p className="font-medium">
                  {clinic.customContract.customSmsQuota.toLocaleString("he-IL")}
                </p>
              </div>
            )}
            {clinic.customContract.customAiTier && (
              <div>
                <p className="text-xs text-muted-foreground">AI מותאם</p>
                <p className="font-medium">{clinic.customContract.customAiTier}</p>
              </div>
            )}
            {clinic.customContract.notes && (
              <div className="sm:col-span-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-1">הערות</p>
                <p className="text-sm">{clinic.customContract.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* חברים */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            חברי קליניקה ({clinic.members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "בעלים", list: owners, icon: Crown, color: "text-amber-400" },
            { label: "מטפלים", list: therapists, icon: Stethoscope, color: "text-blue-400" },
            { label: "מזכירות", list: secretaries, icon: Briefcase, color: "text-purple-400" },
          ].map(({ label, list, icon: Icon, color }) => (
            <div key={label}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-sm font-medium">
                  {label} ({list.length})
                </span>
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground pr-6">אין</p>
              ) : (
                <div className="space-y-1 pr-6">
                  {list.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between text-sm py-1.5 px-3 bg-muted/30 rounded-md"
                    >
                      <div>
                        <span className="font-medium">{m.name || "—"}</span>
                        <span className="text-muted-foreground mr-2 text-xs">{m.email}</span>
                      </div>
                      <div className="flex gap-1.5">
                        {m.isBlocked && (
                          <Badge variant="destructive" className="text-[10px]">חסום</Badge>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                          {m.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* מטא */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
            <div>
              <span>נוצר: </span>
              <span className="text-foreground">{formatDate(clinic.createdAt)}</span>
            </div>
            <div>
              <span>עודכן: </span>
              <span className="text-foreground">{formatDate(clinic.updatedAt)}</span>
            </div>
            {clinic.subscriptionStartedAt && (
              <div>
                <span>מנוי החל: </span>
                <span className="text-foreground">{formatDate(clinic.subscriptionStartedAt)}</span>
              </div>
            )}
            {clinic.subscriptionEndsAt && (
              <div>
                <span>מנוי מסתיים: </span>
                <span className="text-foreground">{formatDate(clinic.subscriptionEndsAt)}</span>
              </div>
            )}
            <div>
              <span>העברות: </span>
              <span className="text-foreground">{clinic._count.transferLogs}</span>
            </div>
            <div>
              <span>תהליכי עזיבה: </span>
              <span className="text-foreground">{clinic._count.departures}</span>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
