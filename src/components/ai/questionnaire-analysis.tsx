"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart3,
  FileText,
  TrendingUp,
  Loader2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface QuestionnaireAnalysisProps {
  clientId: string;
  clientName: string;
  questionnaires: any[];
  userTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  compact?: boolean;
}

export function QuestionnaireAnalysis({
  clientId,
  clientName,
  questionnaires,
  userTier,
  compact = false,
}: QuestionnaireAnalysisProps) {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [analysisType, setAnalysisType] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch usage on mount
  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const response = await fetch("/api/ai/usage");
      const data = await response.json();
      if (data.success) {
        setUsage(data.usage);
      }
    } catch (error) {
      console.error("Error fetching usage:", error);
    }
  };

  const handleAnalyzeSingle = async (responseId: string) => {
    if (!checkLimit("singleQuestionnaire")) return;

    setLoading(true);
    setAnalysisType("single");

    try {
      const response = await fetch("/api/ai/questionnaire/analyze-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze");
      }

      setAnalysisResult(data.analysis.content);
      setDialogOpen(true);
      toast.success("ניתוח הושלם!");
      
      // Update usage
      setUsage((prev: any) => ({
        ...prev,
        singleQuestionnaire: data.usage.current,
        singleQuestionnaireRemaining: data.usage.remaining,
      }));
    } catch (error: any) {
      toast.error(error.message || "שגיאה בניתוח");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeCombined = async () => {
    if (!checkLimit("combinedQuestionnaire")) return;

    setLoading(true);
    setAnalysisType("combined");

    try {
      const response = await fetch("/api/ai/questionnaire/analyze-combined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze");
      }

      setAnalysisResult(data.analysis.content);
      setDialogOpen(true);
      toast.success("ניתוח משולב הושלם!");

      setUsage((prev: any) => ({
        ...prev,
        combinedQuestionnaire: data.usage.current,
        combinedQuestionnaireRemaining: data.usage.remaining,
      }));
    } catch (error: any) {
      toast.error(error.message || "שגיאה בניתוח");
    } finally {
      setLoading(false);
    }
  };

  const handleProgressReport = async () => {
    if (!checkLimit("progressReport")) return;

    setLoading(true);
    setAnalysisType("progress");

    // Default: last 30 days
    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30);

    try {
      const response = await fetch("/api/ai/questionnaire/progress-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate report");
      }

      setAnalysisResult(data.analysis.content);
      setDialogOpen(true);
      toast.success("דו\"ח התקדמות הושלם!");

      setUsage((prev: any) => ({
        ...prev,
        progressReport: data.usage.current,
        progressReportRemaining: data.usage.remaining,
      }));
    } catch (error: any) {
      toast.error(error.message || "שגיאה ביצירת דו\"ח");
    } finally {
      setLoading(false);
    }
  };

  const checkLimit = (type: string) => {
    if (userTier === "ESSENTIAL") {
      toast.error("תכונות AI לא זמינות בתוכנית Essential");
      return false;
    }

    if (!usage) return true;

    const remaining = usage[`${type}Remaining`];
    if (remaining <= 0) {
      toast.error("הגעת למכסה החודשית. שדרג תוכנית או המתן לחודש הבא.");
      return false;
    }

    if (remaining <= 3) {
      toast.warning(`נותרו רק ${remaining} ניתוחים מסוג זה`);
    }

    return true;
  };

  if (userTier === "ESSENTIAL") {
    return null;
  }

  const getProgressColor = (remaining: number, limit: number) => {
    const percentage = (remaining / limit) * 100;
    if (percentage > 30) return "bg-green-500";
    if (percentage > 10) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Usage Counter */}
      {!compact && usage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              מונה שימוש חודשי - AI
            </CardTitle>
            <CardDescription>
              מכסת החודש ({format(new Date(), "MMMM yyyy", { locale: he })})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Single Questionnaire */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>ניתוח שאלון בודד</span>
                <span className="font-medium">
                  {usage.singleQuestionnaire}/{usage.singleQuestionnaireLimit}
                </span>
              </div>
              <Progress
                value={(usage.singleQuestionnaire / usage.singleQuestionnaireLimit) * 100}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                נותרו: {usage.singleQuestionnaireRemaining}
              </p>
            </div>

            {/* Combined Questionnaire */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>ניתוח משולב (כל השאלונים)</span>
                <span className="font-medium">
                  {usage.combinedQuestionnaire}/{usage.combinedQuestionnaireLimit}
                </span>
              </div>
              <Progress
                value={
                  (usage.combinedQuestionnaire / usage.combinedQuestionnaireLimit) * 100
                }
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                נותרו: {usage.combinedQuestionnaireRemaining}
              </p>
            </div>

            {/* Progress Report */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>דו"ח התקדמות חודשי</span>
                <span className="font-medium">
                  {usage.progressReport}/{usage.progressReportLimit}
                </span>
              </div>
              <Progress
                value={(usage.progressReport / usage.progressReportLimit) * 100}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                נותרו: {usage.progressReportRemaining}
              </p>
            </div>

            {/* Warning if low */}
            {(usage.singleQuestionnaireRemaining <= 5 ||
              usage.combinedQuestionnaireRemaining <= 3 ||
              usage.progressReportRemaining <= 2) && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  המכסה החודשית מתקרבת לסיום. שקול לשדרג תוכנית.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Global Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{compact ? "ניתוח AI" : "ניתוחים גלובליים"}</CardTitle>
          <CardDescription>
            ניתוחים על כל השאלונים של {clientName}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button
            onClick={handleAnalyzeCombined}
            disabled={loading || questionnaires.length === 0}
            className="gap-2"
          >
            {loading && analysisType === "combined" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            📊 נתח את כל השאלונים
            {userTier === "ENTERPRISE" && (
              <Badge variant="secondary" className="mr-2">
                Gemini 2.0
              </Badge>
            )}
          </Button>

          {!compact && (
            <Button
              onClick={handleProgressReport}
              disabled={loading}
              variant="outline"
              className="gap-2"
            >
              {loading && analysisType === "progress" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              📈 דו"ח התקדמות (30 יום)
              {userTier === "ENTERPRISE" && (
                <Badge variant="secondary" className="mr-2">
                  Gemini 2.0
                </Badge>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Individual Questionnaires */}
      <Card>
        <CardHeader>
          <CardTitle>שאלונים שמולאו</CardTitle>
          <CardDescription>
            לחץ על "נתח" כדי לקבל פירוש AI לשאלון ספציפי
          </CardDescription>
        </CardHeader>
        <CardContent>
          {questionnaires.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              אין שאלונים שמולאו
            </p>
          ) : (
            <div className="space-y-3">
              {questionnaires.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <div className="font-medium">{q.template.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {q.completedAt
                        ? format(new Date(q.completedAt), "dd/MM/yyyy", {
                            locale: he,
                          })
                        : "לא הושלם"}{" "}
                      • ציון: {q.totalScore || "N/A"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        /* Navigate to questionnaire view */
                      }}
                    >
                      👁️ צפה
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAnalyzeSingle(q.id)}
                      disabled={loading || q.status !== "COMPLETED"}
                    >
                      {loading && analysisType === "single" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "📊 נתח"
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {analysisType === "single" && "ניתוח שאלון"}
              {analysisType === "combined" && "ניתוח משולב - כל השאלונים"}
              {analysisType === "progress" && "דו\"ח התקדמות"}
            </DialogTitle>
            <DialogDescription>
              {analysisType === "single" && "פירוש מקצועי של תוצאות השאלון"}
              {analysisType === "combined" &&
                "מבט רוחב על כל השאלונים ותמונה קלינית"}
              {analysisType === "progress" &&
                "ניתוח התקדמות משולב - שאלונים וסיכומי פגישות"}
            </DialogDescription>
          </DialogHeader>

          <div className="prose prose-sm max-w-none mt-4">
            <div
              className="whitespace-pre-wrap text-right"
              style={{ direction: "rtl" }}
            >
              {analysisResult}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(analysisResult || "");
                toast.success("הועתק ללוח");
              }}
            >
              📋 העתק
            </Button>
            <Button onClick={() => setDialogOpen(false)}>סגור</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
