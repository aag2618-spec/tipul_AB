"use client";

// src/app/(dashboard)/dashboard/settings/packages/PackagesClient.tsx
// Stage 5 — Client Component של דף חבילות.
// תצוגה: כרטיסי חבילה (SMS / AI) עם מחיר ויתרה. כפתור "רכש/י" שולח ל-Cardcom iframe.

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquare,
  Brain,
  Loader2,
  ShoppingCart,
  Ban,
  CheckCircle,
  Tag,
} from "lucide-react";
import type { PackageType } from "@prisma/client";

interface PackageViewItem {
  id: string;
  type: PackageType;
  typeLabelHe: string;
  name: string;
  credits: number;
  priceIls: number;
  priceSource: "POLICY" | "CATALOG";
}

interface PackagesView {
  packages: PackageViewItem[];
  balances: Record<PackageType, number>;
}

const TYPE_ICONS: Record<PackageType, typeof MessageSquare> = {
  SMS: MessageSquare,
  AI_DETAILED_ANALYSIS: Brain,
};

const TYPE_DESCRIPTIONS: Record<PackageType, string> = {
  SMS: "הודעות SMS למטופלים — תזכורות פגישה, אישורי הגעה, הודעות כלליות.",
  AI_DETAILED_ANALYSIS:
    "ניתוחי AI מתקדמים על הקלטות פגישה — סיכומים מורחבים, זיהוי דפוסים, המלצות.",
};

function formatPrice(amount: number): string {
  return `₪${amount.toLocaleString("he-IL")}`;
}

export default function PackagesClient({
  view,
  isBlocked,
}: {
  view: PackagesView;
  isBlocked: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [working, setWorking] = useState<string | null>(null);
  const paramHandledRef = useRef(false);

  // ── הודעות חזרה מ-Cardcom ──
  useEffect(() => {
    const purchaseParam = searchParams.get("purchase");
    if (!purchaseParam) return;
    if (paramHandledRef.current) return;
    paramHandledRef.current = true;

    if (purchaseParam === "success") {
      toast.success("הרכישה הושלמה. הקרדיטים יתווספו תוך מספר שניות.");
      router.replace("/dashboard/settings/packages");
      router.refresh();
    } else if (purchaseParam === "failed") {
      toast.error("הרכישה נכשלה. נסה/י שוב או בחר/י באמצעי תשלום אחר.");
      router.replace("/dashboard/settings/packages");
    }
  }, [searchParams, router]);

  const handlePurchase = async (packageId: string) => {
    setWorking(packageId);
    try {
      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה ברכישה");
        setWorking(null);
        return;
      }
      window.location.href = data.paymentUrl;
    } catch {
      toast.error("שגיאה ברכישה");
      setWorking(null);
    }
  };

  // קיבוץ חבילות לפי type
  const grouped: Record<PackageType, PackageViewItem[]> = {
    SMS: view.packages.filter((p) => p.type === "SMS"),
    AI_DETAILED_ANALYSIS: view.packages.filter(
      (p) => p.type === "AI_DETAILED_ANALYSIS"
    ),
  };

  const noPackagesAvailable = view.packages.length === 0;
  const blockedTitle = isBlocked ? "החשבון חסום — פנה/י לתמיכה" : undefined;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">חבילות נוספות</h1>
        <p className="text-muted-foreground">
          רכישת חבילות חד-פעמיות של SMS וניתוחי AI מתקדמים. הרכישה מתבצעת דרך
          Cardcom והקרדיטים נכנסים מיידית לחשבון.
        </p>
      </div>

      {isBlocked && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <Ban className="h-5 w-5" />
              החשבון חסום
            </CardTitle>
            <CardDescription>
              לא ניתן לרכוש חבילות נוספות בעת שהחשבון חסום. פנה/י לתמיכה להסרת
              החסימה.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* יתרות נוכחיות */}
      <Card>
        <CardHeader>
          <CardTitle>יתרות נוכחיות</CardTitle>
          <CardDescription>היתרה הזמינה לשימוש כעת.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(grouped) as PackageType[]).map((type) => {
              const Icon = TYPE_ICONS[type];
              const label =
                type === "SMS" ? "הודעות SMS" : "ניתוחי AI מתקדם";
              return (
                <div
                  key={type}
                  className="p-4 bg-muted/30 rounded-md border border-border flex items-center gap-3"
                >
                  <Icon className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground">{label}</div>
                    <div className="font-mono text-2xl font-bold">
                      {view.balances[type].toLocaleString("he-IL")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* קטלוג ריק — Empty state */}
      {noPackagesAvailable && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center text-muted-foreground">
            כרגע אין חבילות זמינות לרכישה. נסה/י שוב מאוחר יותר או פנה/י לתמיכה.
          </CardContent>
        </Card>
      )}

      {/* קטלוג */}
      {(Object.keys(grouped) as PackageType[]).map((type) => {
        const Icon = TYPE_ICONS[type];
        const packages = grouped[type];
        if (packages.length === 0) return null;
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {type === "SMS" ? "חבילות SMS" : "חבילות AI מתקדם"}
              </CardTitle>
              <CardDescription>{TYPE_DESCRIPTIONS[type]}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {packages.map((pkg) => {
                  // מחיר ליחידה — עזרה ל-UX להשוואה בין חבילות
                  const perUnitLabel =
                    type === "SMS" ? "להודעה" : "לניתוח";
                  const perUnit =
                    pkg.credits > 0 ? pkg.priceIls / pkg.credits : 0;
                  const perUnitStr = perUnit.toFixed(2);
                  return (
                    <div
                      key={pkg.id}
                      className="p-4 border border-border rounded-lg space-y-3 hover:border-primary/40 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{pkg.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {pkg.credits.toLocaleString("he-IL")}{" "}
                          {type === "SMS" ? "הודעות" : "ניתוחים"}
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold">
                          {formatPrice(pkg.priceIls)}
                        </span>
                        {pkg.priceSource === "POLICY" && (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            title="מחיר מותאם אישית"
                          >
                            <Tag className="h-3 w-3 ml-1" />
                            מותאם
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ₪{perUnitStr} {perUnitLabel}
                      </div>
                      <Button
                        className="w-full"
                        size="sm"
                        disabled={isBlocked || working !== null}
                        onClick={() => handlePurchase(pkg.id)}
                        title={blockedTitle}
                      >
                        {working === pkg.id ? (
                          <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                        ) : (
                          <ShoppingCart className="h-4 w-4 ml-1" />
                        )}
                        רכש/י
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="bg-muted/20 border-dashed">
        <CardContent className="pt-6 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <strong>תשלום מאובטח דרך Cardcom.</strong> אנו לא רואים את פרטי
              הכרטיס.
            </p>
            <p>הקבלה תישלח אוטומטית לאימייל הרשום בחשבון.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
