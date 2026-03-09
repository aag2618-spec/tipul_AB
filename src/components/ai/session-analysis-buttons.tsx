"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText, BookOpen, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface SessionAnalysisButtonsProps {
  sessionId: string;
  userTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  onAnalysisComplete?: () => void;
}

export function SessionAnalysisButtons({
  sessionId,
  userTier,
  onAnalysisComplete,
}: SessionAnalysisButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [analysisType, setAnalysisType] = useState<"CONCISE" | "DETAILED" | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleAnalyze = async (type: "CONCISE" | "DETAILED", forceRegenerate: boolean = false) => {
    setLoading(true);
    setAnalysisType(type);

    try {
      const response = await fetch("/api/ai/session/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          analysisType: type,
          force: forceRegenerate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze session");
      }

      setAnalysisResult(data.analysis.content);
      setDialogOpen(true);

      if (data.cached) {
        toast.success("ניתוח נטען מהמטמון");
      } else {
        toast.success("ניתוח הושלם בהצלחה!");
      }

      onAnalysisComplete?.();
    } catch (error: any) {
      toast.error(error.message || "שגיאה בניתוח");
    } finally {
      setLoading(false);
    }
  };

  if (userTier === "ESSENTIAL") {
    return null; // No AI for Essential
  }

  return (
    <>
      <div className="flex gap-2 items-center">
        {/* Concise Analysis */}
        <Button
          onClick={() => handleAnalyze("CONCISE")}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading && analysisType === "CONCISE" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          📄 ניתוח תמציתי
        </Button>

        {/* Detailed Analysis - Enterprise only */}
        {userTier === "ENTERPRISE" && (
          <Button
            onClick={() => handleAnalyze("DETAILED")}
            disabled={loading}
            className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
          >
            {loading && analysisType === "DETAILED" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            📚 ניתוח מפורט
            <Badge variant="secondary" className="mr-2">
              <Sparkles className="h-3 w-3 ml-1" />
              AI מתקדם
            </Badge>
          </Button>
        )}

        {/* Info tooltips */}
        <div className="text-xs text-muted-foreground">
          <div>תמציתי: חצי עמוד, ללא הגבלה</div>
          {userTier === "ENTERPRISE" && (
            <div>מפורט: 2-3 עמודים ברמה אקדמית, 10/חודש</div>
          )}
        </div>
      </div>

      {/* Analysis Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {analysisType === "CONCISE" ? (
                <>
                  <FileText className="h-5 w-5" />
                  ניתוח תמציתי
                </>
              ) : (
                <>
                  <BookOpen className="h-5 w-5" />
                  ניתוח מפורט
                  <Badge variant="secondary" className="mr-2">
                    AI מתקדם
                  </Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {analysisType === "CONCISE"
                ? "סיכום מקצועי וממוקד של הפגישה"
                : "ניתוח מעמיק ברמה אקדמית"}
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
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                if (analysisType) {
                  handleAnalyze(analysisType, true);
                }
              }}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              צור מחדש
            </Button>
            <Button onClick={() => setDialogOpen(false)}>סגור</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
