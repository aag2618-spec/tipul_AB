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
import { AiAnalysisContent, copyAnalysisRich } from "@/components/ai/ai-analysis-content";

interface SessionAnalysisButtonsProps {
  sessionId: string;
  userTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  onAnalysisComplete?: () => void;
  // סוגי ניתוח שכבר קיימים — כדי להציג כפתור יצירה רק למה שעדיין חסר.
  existingTypes?: ("CONCISE" | "DETAILED")[];
}

export function SessionAnalysisButtons({
  sessionId,
  userTier,
  onAnalysisComplete,
  existingTypes = [],
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
        // M1 + סבב 8: AI routes מחזירים `message` (לא `error`). הודעת consent
        // כוללת הנחיה למטפל איך לעדכן את ההסכמה בכרטיס המטופל.
        // M9.4: fallback בעברית (לא Failed to ...) — feedback_hebrew_ui.
        throw new Error(data.message || data.error || "שגיאה בניתוח הפגישה");
      }

      setAnalysisResult(data.analysis.content);
      setDialogOpen(true);

      if (data.cached) {
        toast.success("ניתוח נטען מהמטמון");
      } else {
        toast.success("ניתוח הושלם בהצלחה!");
      }

      onAnalysisComplete?.();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "שגיאה בניתוח");
    } finally {
      setLoading(false);
    }
  };

  if (userTier === "ESSENTIAL") {
    return null; // No AI for Essential
  }

  // "חכם — רק מה שחסר": מציגים כפתור יצירה רק לסוג שעדיין לא נותח.
  const addMode = existingTypes.length > 0; // כבר קיים לפחות ניתוח אחד
  const showConcise = !existingTypes.includes("CONCISE");
  const showDetailed = userTier === "ENTERPRISE" && !existingTypes.includes("DETAILED");

  // אין מה ליצור (שני הסוגים קיימים, או PRO שכבר יש לו תמציתי) — לא מציגים כלום.
  if (!showConcise && !showDetailed) {
    return null;
  }

  return (
    <>
      <div className="flex gap-2 items-center">
        {/* ניתוח תמציתי — מוצג רק אם עדיין לא נותח */}
        {showConcise && (
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
            {addMode ? "➕ הוסף ניתוח תמציתי" : "📄 ניתוח תמציתי"}
          </Button>
        )}

        {/* ניתוח מפורט — Enterprise בלבד, ומוצג רק אם עדיין לא נותח */}
        {showDetailed && (
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
            {addMode ? "➕ הוסף ניתוח מפורט" : "📚 ניתוח מפורט"}
            <Badge variant="secondary" className="mr-2">
              <Sparkles className="h-3 w-3 ml-1" />
              AI מתקדם
            </Badge>
          </Button>
        )}

        {/* מידע על הסוגים — רק במצב ההתחלתי (לפני הניתוח הראשון) */}
        {!addMode && (
          <div className="text-xs text-muted-foreground">
            <div>תמציתי: חצי עמוד, ללא הגבלה</div>
            {userTier === "ENTERPRISE" && (
              <div>מפורט: 2-3 עמודים ברמה אקדמית, 10/חודש</div>
            )}
          </div>
        )}
      </div>

      {/* Analysis Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {analysisType === "CONCISE" ? (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="text-lg font-bold">ניתוח תמציתי</span>
                </>
              ) : (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-sm">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <span className="text-lg font-bold">ניתוח מפורט</span>
                  <Badge variant="secondary" className="mr-1">
                    <Sparkles className="ml-1 h-3 w-3" />
                    AI מתקדם
                  </Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="pr-[52px] text-right">
              {analysisType === "CONCISE"
                ? "סיכום מקצועי וממוקד של הפגישה"
                : "ניתוח מעמיק ברמה אקדמית"}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <AiAnalysisContent text={analysisResult || ""} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                copyAnalysisRich(analysisResult || "")
                  .then(() => toast.success("הועתק ללוח (עם עיצוב)"))
                  .catch(() => toast.error("שגיאה בהעתקה"));
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
