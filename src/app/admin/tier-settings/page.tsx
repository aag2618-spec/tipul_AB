"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  RefreshCw,
  Save,
  RotateCcw,
  Check,
  X,
  Sparkles,
  FileText,
  BarChart3,
  Brain,
} from "lucide-react";
import { toast } from "sonner";

interface TierLimit {
  id: string;
  tier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  displayNameHe: string;
  displayNameEn: string;
  priceMonthly: number;
  description: string | null;
  sessionPrepLimit: number;
  conciseAnalysisLimit: number;
  detailedAnalysisLimit: number;
  singleQuestionnaireLimit: number;
  combinedQuestionnaireLimit: number;
  progressReportLimit: number;
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
      "פעולה הרסנית: כל ההתאמות האישיות של מחירים ומכסות יימחקו.\n" +
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

  const renderLimitInput = (
    limit: TierLimit,
    field: keyof TierLimit,
    label: string,
    description: string
  ) => {
    const value = getValue(limit, field) as number;
    const isBlocked = value === -1;
    const isUnlimited = value === 0;

    return (
      <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <div className="flex-1">
          <p className="text-foreground font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {isBlocked ? (
            <Badge variant="destructive" className="ml-2">
              <X className="h-3 w-3 ml-1" />
              חסום
            </Badge>
          ) : isUnlimited ? (
            <Badge variant="secondary" className="ml-2 bg-green-500/20 text-green-400">
              <Check className="h-3 w-3 ml-1" />
              ללא הגבלה
            </Badge>
          ) : null}
          <Input
            type="number"
            value={value}
            onChange={(e) => handleChange(limit.tier, field, parseInt(e.target.value) || 0)}
            className="w-24 text-center"
          />
        </div>
      </div>
    );
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
          <p className="text-muted-foreground mt-1">ניהול מכסות ומחירים לכל תוכנית</p>
        </div>

        <Button variant="outline" onClick={handleReset} disabled={saving} className="border-red-500 text-red-500">
          <RotateCcw className="ml-2 h-4 w-4" />
          אפס לברירת מחדל
        </Button>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-6 flex-wrap text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="text-xs">-1</Badge>
              <span className="text-muted-foreground">= חסום (לא זמין בתוכנית)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400">0</Badge>
              <span className="text-muted-foreground">= ללא הגבלה</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">N</Badge>
              <span className="text-muted-foreground">= מספר מקסימלי לחודש</span>
            </div>
          </div>
        </CardContent>
      </Card>

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

              {/* Session Prep Limits */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-400" />
                    הכנה לפגישות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renderLimitInput(
                    limit,
                    "sessionPrepLimit",
                    "הכנות לפגישה",
                    "הכנת AI לפני פגישה עם סיכום מהפגישות הקודמות"
                  )}
                </CardContent>
              </Card>

              {/* Session Analysis Limits */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-sky-400" />
                    ניתוחי פגישות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renderLimitInput(
                    limit,
                    "conciseAnalysisLimit",
                    "ניתוח תמציתי",
                    "ניתוח קצר של פגישה (סיכום, נושאים, המלצות)"
                  )}
                  {renderLimitInput(
                    limit,
                    "detailedAnalysisLimit",
                    "ניתוח מפורט",
                    "ניתוח מעמיק לפי גישה טיפולית (2-3 עמודים)"
                  )}
                </CardContent>
              </Card>

              {/* Questionnaire Limits */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-green-400" />
                    ניתוחי שאלונים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renderLimitInput(
                    limit,
                    "singleQuestionnaireLimit",
                    "ניתוח שאלון בודד",
                    "ניתוח AI של תוצאות שאלון אחד"
                  )}
                  {renderLimitInput(
                    limit,
                    "combinedQuestionnaireLimit",
                    "ניתוח משולב",
                    "ניתוח של כל השאלונים של מטופל"
                  )}
                  {renderLimitInput(
                    limit,
                    "progressReportLimit",
                    "דוח התקדמות",
                    "דוח משולב של שאלונים + פגישות"
                  )}
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
