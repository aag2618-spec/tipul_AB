"use client";

// src/components/billing/sms-packages-card.tsx
// כרטיס "חבילות SMS" בתוך דף החיוב — מציג יתרה (מכסה חודשית + קרדיטים שנרכשו)
// ומאפשר רכישת חבילה. הנתונים נטענים מ-/api/packages (קריאה בלבד),
// והרכישה מתבצעת דרך /api/packages/purchase הקיים (Cardcom).
//
// המחירים והחבילות נשלטים מהניהול (admin/pricing/sms-packages) — הרכיב מציג
// את הקטלוג כפי שהוא, בלי ערכים קשיחים.

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquare,
  Loader2,
  ShoppingCart,
  AlertCircle,
  RefreshCw,
  Tag,
} from "lucide-react";

interface PackageItem {
  id: string;
  type: string;
  name: string;
  credits: number;
  priceIls: number;
  priceSource: "POLICY" | "CATALOG";
}

interface PackagesData {
  packages: PackageItem[];
  balances: Record<string, number>;
  isBlocked: boolean;
  monthlyQuota: number;
  monthlyRemaining: number;
}

export function SmsPackagesCard() {
  const [data, setData] = useState<PackagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const fetchPackages = async () => {
    setError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/packages");
      if (!res.ok) throw new Error("failed");
      const d = (await res.json()) as PackagesData;
      setData(d);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPackages();
  }, []);

  const handlePurchase = async (packageId: string) => {
    if (working) return;
    setWorking(packageId);
    try {
      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.message || "שגיאה ברכישה");
        setWorking(null);
        return;
      }
      // מעבר ל-Cardcom. החזרה מ-Cardcom מובילה לעמוד החבילות עם עדכון היתרה.
      window.location.href = d.paymentUrl;
    } catch {
      toast.error("שגיאה ברכישה");
      setWorking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          חבילות SMS
        </CardTitle>
        <CardDescription>
          הודעות SMS למטופלים נשלחות מהמכסה שלך. כאן רואים יתרה ורוכשים חבילה
          נוספת בעת הצורך.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 text-center py-6">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              לא הצלחנו לטעון את חבילות ה-SMS. נסה/י שוב.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void fetchPackages();
              }}
            >
              <RefreshCw className="h-4 w-4 ml-1" />
              נסה שוב
            </Button>
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* יתרות */}
            <div className="grid gap-3 sm:grid-cols-2">
              {data.monthlyQuota > 0 && (
                <div className="p-4 bg-muted/40 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    מכסה חודשית שנותרה
                  </div>
                  <div className="text-2xl font-bold">
                    {data.monthlyRemaining.toLocaleString("he-IL")}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {data.monthlyQuota.toLocaleString("he-IL")}
                    </span>
                  </div>
                </div>
              )}
              <div className="p-4 bg-muted/40 rounded-lg">
                <div className="text-sm text-muted-foreground">
                  יתרה מחבילות שנרכשו
                </div>
                <div className="text-2xl font-bold">
                  {(data.balances?.SMS ?? 0).toLocaleString("he-IL")}
                </div>
              </div>
            </div>

            {data.isBlocked && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400">
                  החשבון חסום — לא ניתן לרכוש חבילות. פנה/י לתמיכה.
                </p>
              </div>
            )}

            {/* קטלוג */}
            {data.packages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4 border border-dashed rounded-lg">
                כרגע אין חבילות SMS זמינות לרכישה.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.packages.map((pkg) => {
                  const perUnit =
                    pkg.credits > 0 ? pkg.priceIls / pkg.credits : 0;
                  return (
                    <div
                      key={pkg.id}
                      className="p-4 border border-border rounded-lg space-y-2 hover:border-primary/40 transition-colors"
                    >
                      <div className="font-medium">{pkg.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {pkg.credits.toLocaleString("he-IL")} הודעות
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold">
                          ₪{pkg.priceIls.toLocaleString("he-IL")}
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
                        ₪{perUnit.toFixed(2)} להודעה
                      </div>
                      <Button
                        className="w-full"
                        size="sm"
                        disabled={data.isBlocked || working !== null}
                        onClick={() => handlePurchase(pkg.id)}
                        title={data.isBlocked ? 'החשבון חסום — פנה/י לתמיכה' : undefined}
                      >
                        {working === pkg.id ? (
                          <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                        ) : (
                          <ShoppingCart className="h-4 w-4 ml-1" />
                        )}
                        רכישה
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              התשלום מאובטח דרך Cardcom. הקבלה נשלחת אוטומטית לאימייל הרשום בחשבון.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
