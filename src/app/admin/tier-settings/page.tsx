"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  RefreshCw,
  Save,
  RotateCcw,
  Percent,
} from "lucide-react";
import { toast } from "sonner";

interface TierLimit {
  id: string;
  tier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  displayNameHe: string;
  displayNameEn: string;
  priceMonthly: number;
  description: string | null;
  discountQuarterly: number;
  discountSemiAnnual: number;
  discountAnnual: number;
}

const TIER_COLORS = {
  ESSENTIAL: "bg-gray-500/20 text-gray-300",
  PRO: "bg-sky-500/20 text-sky-300",
  ENTERPRISE: "bg-purple-500/20 text-purple-300",
};

const TIER_ICONS = {
  ESSENTIAL: "🥉",
  PRO: "🥈",
  ENTERPRISE: "🥇",
};

export default function TierSettingsPage() {
  const [limits, setLimits] = useState<TierLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedLimits, setEditedLimits] = useState<Record<string, Partial<TierLimit>>>({});

  useEffect(() => {
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/tier-limits");
      if (response.ok) {
        const data = await response.json();
        setLimits(data.limits);
        setEditedLimits({});
      } else {
        toast.error("שגיאה בטעינת ההגדרות");
      }
    } catch (error) {
      console.error("Error fetching limits:", error);
      toast.error("שגיאה בטעינת ההגדרות");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (tier: string, field: string, value: number | string) => {
    setEditedLimits((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value,
      },
    }));
  };

  const getValue = (limit: TierLimit, field: keyof TierLimit) => {
    const edited = editedLimits[limit.tier];
    if (edited && field in edited) {
      return edited[field];
    }
    return limit[field];
  };

  const hasChanges = (tier: string) => {
    return editedLimits[tier] && Object.keys(editedLimits[tier]).length > 0;
  };

  const handleSave = async (tier: string) => {
    if (!editedLimits[tier]) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/tier-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, ...editedLimits[tier] }),
      });

      if (response.ok) {
        toast.success("ההגדרות נשמרו בהצלחה");
        fetchLimits();
      } else {
        toast.error("שגיאה בשמירת ההגדרות");
      }
    } catch (error) {
      toast.error("שגיאה בשמירת ההגדרות");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const confirmMsg =
      "פעולה הרסנית: כל ההתאמות האישיות של מחירים והנחות יימחקו.\n" +
      "כדי לאשר, הקלד בדיוק: RESET_TIER_LIMITS";
    const input = window.prompt(confirmMsg);
    if (input !== "RESET_TIER_LIMITS") {
      if (input !== null) {
        toast.error("הטקסט לא תואם — האיפוס בוטל");
      }
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/tier-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET_TIER_LIMITS" }),
      });
      if (response.ok) {
        toast.success("ההגדרות אופסו בהצלחה");
        fetchLimits();
      } else {
        toast.error("שגיאה באיפוס");
      }
    } catch (error) {
      toast.error("שגיאה באיפוס");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8 text-primary" />
            הגדרות תוכניות
          </h1>
          <p className="text-muted-foreground mt-1">ניהול מחירים והנחות לכל תוכנית</p>
        </div>

        <Button variant="outline" onClick={handleReset} disabled={saving} className="border-red-500 text-red-500">
          <RotateCcw className="ml-2 h-4 w-4" />
          אפס לברירת מחדל
        </Button>
      </div>

      {/* Tier Tabs */}
      <Tabs defaultValue="ESSENTIAL" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          {limits.map((limit) => (
            <TabsTrigger
              key={limit.tier}
              value={limit.tier}
            >
              <span className="ml-2">{TIER_ICONS[limit.tier]}</span>
              {limit.displayNameHe}
              {hasChanges(limit.tier) && (
                <span className="mr-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {limits.map((limit) => (
          <TabsContent key={limit.tier} value={limit.tier} className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">{TIER_ICONS[limit.tier]}</span>
                    פרטי התוכנית
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground">שם בעברית</label>
                    <Input
                      value={getValue(limit, "displayNameHe") as string}
                      onChange={(e) => handleChange(limit.tier, "displayNameHe", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">שם באנגלית</label>
                    <Input
                      value={getValue(limit, "displayNameEn") as string}
                      onChange={(e) => handleChange(limit.tier, "displayNameEn", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">מחיר חודשי (₪)</label>
                    <Input
                      type="number"
                      value={getValue(limit, "priceMonthly") as number}
                      onChange={(e) => handleChange(limit.tier, "priceMonthly", parseInt(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* הנחות לפי תקופה */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Percent className="h-5 w-5 text-green-400" />
                    הנחות לפי תקופת תשלום
                  </CardTitle>
                  <CardDescription>אחוז הנחה לתשלום מראש לתקופות ארוכות</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div className="flex-1">
                      <p className="text-foreground font-medium">3 חודשים</p>
                      <p className="text-xs text-muted-foreground">הנחה לרבעון</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={getValue(limit, "discountQuarterly") as number}
                        onChange={(e) => handleChange(limit.tier, "discountQuarterly", parseInt(e.target.value) || 0)}
                        className="w-24 text-center"
                      />
                      <span className="text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div className="flex-1">
                      <p className="text-foreground font-medium">חצי שנה</p>
                      <p className="text-xs text-muted-foreground">הנחה ל-6 חודשים</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={getValue(limit, "discountSemiAnnual") as number}
                        onChange={(e) => handleChange(limit.tier, "discountSemiAnnual", parseInt(e.target.value) || 0)}
                        className="w-24 text-center"
                      />
                      <span className="text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex-1">
                      <p className="text-foreground font-medium">שנתי</p>
                      <p className="text-xs text-muted-foreground">הנחה ל-12 חודשים</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={getValue(limit, "discountAnnual") as number}
                        onChange={(e) => handleChange(limit.tier, "discountAnnual", parseInt(e.target.value) || 0)}
                        className="w-24 text-center"
                      />
                      <span className="text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Save Button */}
            {hasChanges(limit.tier) && (
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={() => handleSave(limit.tier)}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {saving ? (
                    <RefreshCw className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ml-2 h-4 w-4" />
                  )}
                  שמור שינויים
                </Button>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
