"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  FileText,
  BarChart3,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Lock,
  RefreshCw,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageFeature {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  blocked: boolean;
}

interface UsageData {
  tier: {
    code: string;
    displayName: string;
    displayNameEn: string;
    price: number;
  };
  subscription: {
    status: string;
    endsAt: string | null;
  };
  month: string;
  features: {
    sessionPrep: UsageFeature;
    conciseAnalysis: UsageFeature;
    detailedAnalysis: UsageFeature;
    singleQuestionnaire: UsageFeature;
    combinedQuestionnaire: UsageFeature;
    progressReport: UsageFeature;
  };
  totals: {
    cost: number;
    tokens: number;
  };
}

const FEATURE_INFO = {
  sessionPrep: {
    label: "הכנה לפגישה",
    description: "הכנת AI לפני פגישה",
    icon: Brain,
    color: "text-purple-500",
    bgColor: "bg-purple-500",
  },
  conciseAnalysis: {
    label: "ניתוח תמציתי",
    description: "ניתוח קצר של פגישה",
    icon: FileText,
    color: "text-blue-500",
    bgColor: "bg-blue-500",
  },
  detailedAnalysis: {
    label: "ניתוח מפורט",
    description: "ניתוח מעמיק לפי גישה",
    icon: Sparkles,
    color: "text-amber-500",
    bgColor: "bg-amber-500",
  },
  singleQuestionnaire: {
    label: "ניתוח שאלון",
    description: "ניתוח שאלון בודד",
    icon: BarChart3,
    color: "text-green-500",
    bgColor: "bg-green-500",
  },
  combinedQuestionnaire: {
    label: "ניתוח משולב",
    description: "ניתוח כל השאלונים",
    icon: TrendingUp,
    color: "text-teal-500",
    bgColor: "bg-teal-500",
  },
  progressReport: {
    label: "דוח התקדמות",
    description: "דוח שאלונים + פגישות",
    icon: Zap,
    color: "text-orange-500",
    bgColor: "bg-orange-500",
  },
};

const TIER_STYLES = {
  ESSENTIAL: {
    badge: "bg-gray-100 text-gray-800 border-gray-300",
    icon: "🥉",
  },
  PRO: {
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    icon: "🥈",
  },
  ENTERPRISE: {
    badge: "bg-purple-100 text-purple-800 border-purple-300",
    icon: "🥇",
  },
};

interface UsageDisplayProps {
  compact?: boolean;
  showTierInfo?: boolean;
}

export function UsageDisplay({ compact = false, showTierInfo = true }: UsageDisplayProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/user/usage");
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
        setError(null);
      } else {
        setError("שגיאה בטעינת נתוני השימוש");
      }
    } catch (err) {
      setError("שגיאה בטעינת נתוני השימוש");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card">
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !usage) {
    return (
      <Card className="bg-card border-red-200">
        <CardContent className="flex items-center gap-2 py-4 text-red-500">
          <AlertCircle className="h-5 w-5" />
          <span>{error || "לא ניתן לטעון נתונים"}</span>
          <Button variant="ghost" size="sm" onClick={fetchUsage}>
            נסה שוב
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tierStyle = TIER_STYLES[usage.tier.code as keyof typeof TIER_STYLES] || TIER_STYLES.ESSENTIAL;

  // Filter features - show only available (not blocked) in compact mode
  const featuresToShow = Object.entries(usage.features).filter(([_, feature]) => {
    if (compact) {
      return !feature.blocked;
    }
    return true;
  });

  if (compact) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              שימוש ב-AI החודש
            </CardTitle>
            <Badge className={cn("text-xs", tierStyle.badge)}>
              {tierStyle.icon} {usage.tier.displayName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {featuresToShow.length === 0 ? (
            <div className="text-center py-2 text-muted-foreground text-sm">
              <Lock className="h-4 w-4 mx-auto mb-1" />
              אין גישה לתכונות AI בתוכנית זו
            </div>
          ) : (
            featuresToShow.slice(0, 4).map(([key, feature]) => {
              const info = FEATURE_INFO[key as keyof typeof FEATURE_INFO];
              const Icon = info.icon;
              
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <Icon className={cn("h-3 w-3", info.color)} />
                      {info.label}
                    </span>
                    <span className="text-muted-foreground">
                      {feature.limit === 0 ? (
                        <span className="text-green-600">ללא הגבלה</span>
                      ) : (
                        `${feature.used}/${feature.limit}`
                      )}
                    </span>
                  </div>
                  {feature.limit > 0 && (
                    <Progress
                      value={feature.percentage}
                      className={cn(
                        "h-1",
                        feature.percentage > 80 ? "bg-red-100" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    );
  }

  // Full display
  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              שימוש ב-AI
            </CardTitle>
            <CardDescription>חודש {usage.month}</CardDescription>
          </div>
          {showTierInfo && (
            <div className="text-left">
              <Badge className={cn("text-sm px-3 py-1", tierStyle.badge)}>
                {tierStyle.icon} {usage.tier.displayName}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                ₪{usage.tier.price}/חודש
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Features Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(usage.features).map(([key, feature]) => {
            const info = FEATURE_INFO[key as keyof typeof FEATURE_INFO];
            const Icon = info.icon;
            
            return (
              <div
                key={key}
                className={cn(
                  "p-4 rounded-lg border",
                  feature.blocked ? "bg-muted/50 border-dashed" : "bg-card"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-2 rounded-lg", feature.blocked ? "bg-muted" : `${info.bgColor}/10`)}>
                      <Icon className={cn("h-4 w-4", feature.blocked ? "text-muted-foreground" : info.color)} />
                    </div>
                    <div>
                      <p className={cn("font-medium text-sm", feature.blocked && "text-muted-foreground")}>
                        {info.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                  
                  {feature.blocked ? (
                    <Badge variant="outline" className="text-xs">
                      <Lock className="h-3 w-3 ml-1" />
                      לא זמין
                    </Badge>
                  ) : feature.limit === 0 ? (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                      <CheckCircle className="h-3 w-3 ml-1" />
                      ללא הגבלה
                    </Badge>
                  ) : null}
                </div>
                
                {!feature.blocked && feature.limit > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {feature.used} מתוך {feature.limit}
                      </span>
                      <span className={cn(
                        "font-medium",
                        feature.percentage > 80 ? "text-red-500" : 
                        feature.percentage > 50 ? "text-amber-500" : "text-green-500"
                      )}>
                        {feature.remaining} נותרו
                      </span>
                    </div>
                    <Progress
                      value={feature.percentage}
                      className={cn(
                        "h-2",
                        feature.percentage > 80 ? "[&>div]:bg-red-500" : 
                        feature.percentage > 50 ? "[&>div]:bg-amber-500" : `[&>div]:${info.bgColor}`
                      )}
                    />
                    {feature.percentage > 80 && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        קרוב למגבלה החודשית
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Upgrade prompt for ESSENTIAL */}
        {usage.tier.code === "ESSENTIAL" && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200">
            <div className="flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-blue-500" />
              <div>
                <p className="font-medium">שדרג לתוכנית מקצועית</p>
                <p className="text-sm text-muted-foreground">
                  קבל גישה לכל תכונות ה-AI: הכנה לפגישות, ניתוחים, ודוחות
                </p>
              </div>
              <Button className="mr-auto" size="sm">
                שדרג עכשיו
              </Button>
            </div>
          </div>
        )}

        {/* Upgrade prompt for PRO */}
        {usage.tier.code === "PRO" && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-amber-500/10 border border-purple-200">
            <div className="flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-purple-500" />
              <div>
                <p className="font-medium">שדרג לתוכנית ארגונית</p>
                <p className="text-sm text-muted-foreground">
                  קבל ניתוחים מפורטים לפי גישות טיפוליות ומכסות גבוהות יותר
                </p>
              </div>
              <Button className="mr-auto" size="sm" variant="outline">
                למידע נוסף
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact inline usage indicator
export function UsageIndicator() {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/user/usage")
      .then((res) => res.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  if (!usage) return null;

  const tierStyle = TIER_STYLES[usage.tier.code as keyof typeof TIER_STYLES] || TIER_STYLES.ESSENTIAL;

  // Check if any feature is near limit
  const hasWarning = Object.values(usage.features).some(
    (f) => !f.blocked && f.limit > 0 && f.percentage > 80
  );

  return (
    <Badge className={cn("gap-1", tierStyle.badge, hasWarning && "animate-pulse")}>
      {tierStyle.icon}
      {usage.tier.displayName}
      {hasWarning && <AlertCircle className="h-3 w-3 text-red-500" />}
    </Badge>
  );
}
