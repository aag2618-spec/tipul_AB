"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronRight, 
  Brain,
  FileText,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Question {
  id: number;
  title: string;
  section?: string;
  sectionName?: string;
  options?: { value: number; text: string }[];
}

interface Template {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  category: string | null;
  testType: string;
  questions: Question[];
  scoring: {
    ranges?: { min: number; max: number; label: string; description: string }[];
    maxScore?: number;
    cutoff?: number;
    subscales?: Record<string, { items: number[]; name: string }>;
  };
}

interface Response {
  id: string;
  answers: any[];
  totalScore: number | null;
  subscores: Record<string, number> | null;
  aiAnalysis: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  template: Template;
  client: {
    id: string;
    name: string;
    birthDate: string | null;
  };
}

export default function QuestionnaireResultsPage() {
  const router = useRouter();
  const params = useParams();
  const responseId = params.id as string;

  const [response, setResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetchResponse();
  }, [responseId]);

  const fetchResponse = async () => {
    try {
      const res = await fetch(`/api/questionnaires/responses/${responseId}`);
      if (res.ok) {
        const data = await res.json();
        setResponse(data);
      } else {
        toast.error("שאלון לא נמצא");
        router.push("/dashboard/questionnaires");
      }
    } catch (error) {
      console.error("Error fetching response:", error);
      toast.error("שגיאה בטעינת השאלון");
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithAI = async () => {
    if (!response) return;
    
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/questionnaires/responses/${responseId}/analyze`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        setResponse(prev => prev ? {
          ...prev,
          aiAnalysis: data.analysis,
          status: "ANALYZED"
        } : null);
        toast.success("הניתוח הושלם בהצלחה!");
      } else {
        const error = await res.json();
        toast.error(error.error || "שגיאה בניתוח");
      }
    } catch (error) {
      console.error("Error analyzing:", error);
      toast.error("שגיאה בניתוח");
    } finally {
      setAnalyzing(false);
    }
  };

  const getScoreLevel = () => {
    if (!response || response.totalScore === null) return null;
    
    const ranges = response.template.scoring?.ranges;
    if (!ranges) return null;
    
    return ranges.find(r => 
      response.totalScore! >= r.min && response.totalScore! <= r.max
    );
  };

  const getScoreColor = (level: string | undefined) => {
    switch (level) {
      case "מינימלי":
      case "תקין/מינימלי":
        return "bg-green-500";
      case "קל":
        return "bg-yellow-500";
      case "בינוני":
        return "bg-orange-500";
      case "חמור":
        return "bg-red-500";
      case "מתחת לסף":
        return "bg-green-500";
      case "מעל הסף":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>שאלון לא נמצא</p>
      </div>
    );
  }

  const scoreLevel = getScoreLevel();
  const maxScore = response.template.scoring?.maxScore || 100;
  const scorePercentage = response.totalScore !== null 
    ? (response.totalScore / maxScore) * 100 
    : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/questionnaires")}
          >
            <ArrowLeft className="h-4 w-4 ml-2" />
            חזרה לשאלונים
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{response.template.name}</h1>
            <p className="text-muted-foreground">
              {response.client.name} • {new Date(response.completedAt || response.startedAt).toLocaleDateString("he-IL")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={response.status === "ANALYZED" ? "default" : "secondary"}>
            {response.status === "COMPLETED" && "הושלם"}
            {response.status === "ANALYZED" && "נותח"}
            {response.status === "IN_PROGRESS" && "בתהליך"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Score Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                תוצאות השאלון
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Total Score */}
              <div className="text-center space-y-4">
                <div className="text-6xl font-bold">
                  {response.totalScore ?? "-"}
                  <span className="text-2xl text-muted-foreground">
                    /{maxScore}
                  </span>
                </div>
                
                {scoreLevel && (
                  <div className="flex flex-col items-center gap-2">
                    <Badge 
                      className={`text-lg px-4 py-1 ${getScoreColor(scoreLevel.label)} text-white`}
                    >
                      {scoreLevel.label}
                    </Badge>
                    <p className="text-muted-foreground">{scoreLevel.description}</p>
                  </div>
                )}

                <Progress value={scorePercentage} className="w-full h-3" />
              </div>

              <Separator />

              {/* Subscores */}
              {response.subscores && Object.keys(response.subscores).length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold">ציונים לפי קטגוריות</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(response.subscores).map(([key, value]) => {
                      const subscale = response.template.scoring?.subscales?.[key];
                      return (
                        <div key={key} className="p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            {subscale?.name || key}
                          </p>
                          <p className="text-xl font-semibold">{value}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Answers Summary */}
              <div className="space-y-4">
                <h3 className="font-semibold">סיכום תשובות</h3>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {response.template.questions.map((question, index) => {
                    const answer = response.answers[index];
                    const selectedOption = question.options?.find(
                      o => o.value === answer?.value
                    );
                    
                    return (
                      <div 
                        key={question.id} 
                        className="flex justify-between items-start p-2 text-sm border-b last:border-0"
                      >
                        <span className="flex-1">
                          <span className="font-medium">{index + 1}.</span> {question.title}
                        </span>
                        <Badge variant="outline" className="mr-2">
                          {selectedOption?.text || answer?.value || "-"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                ניתוח בינה מלאכותית
              </CardTitle>
              <CardDescription>
                ניתוח מקצועי של תוצאות השאלון על ידי AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              {response.aiAnalysis ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{response.aiAnalysis}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Brain className="h-16 w-16 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium">עדיין לא בוצע ניתוח AI</p>
                    <p className="text-sm text-muted-foreground">
                      לחץ על הכפתור למטה לקבלת ניתוח מקצועי של התוצאות
                    </p>
                  </div>
                  <Button 
                    onClick={analyzeWithAI} 
                    disabled={analyzing || response.status === "IN_PROGRESS"}
                    size="lg"
                    className="mt-4"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                        מנתח...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4 ml-2" />
                        נתח עם בינה מלאכותית
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
            {response.aiAnalysis && (
              <CardFooter className="justify-end">
                <Button 
                  onClick={analyzeWithAI} 
                  disabled={analyzing}
                  variant="outline"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      מנתח...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 ml-2" />
                      נתח מחדש
                    </>
                  )}
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פרטי השאלון</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">שם השאלון</p>
                <p className="font-medium">{response.template.name}</p>
                {response.template.nameEn && (
                  <p className="text-sm text-muted-foreground">{response.template.nameEn}</p>
                )}
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground">קטגוריה</p>
                <Badge variant="secondary">{response.template.category || "כללי"}</Badge>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">מטופל</p>
                <p className="font-medium">{response.client.name}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">תאריך מילוי</p>
                <p className="font-medium">
                  {new Date(response.completedAt || response.startedAt).toLocaleDateString("he-IL", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>

              {response.template.description && (
                <div>
                  <p className="text-sm text-muted-foreground">תיאור</p>
                  <p className="text-sm">{response.template.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פעולות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => router.push(`/dashboard/questionnaires/${responseId}/fill`)}
              >
                <FileText className="h-4 w-4 ml-2" />
                צפייה/עריכת תשובות
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => {
                  // TODO: Implement PDF export
                  toast.info("ייצוא PDF יהיה זמין בקרוב");
                }}
              >
                <Download className="h-4 w-4 ml-2" />
                הורדת דו"ח PDF
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => router.push(`/dashboard/clients/${response.client.id}`)}
              >
                <ChevronRight className="h-4 w-4 ml-2" />
                לכרטיס המטופל
              </Button>
            </CardContent>
          </Card>

          {/* Warning Card for critical scores */}
          {scoreLevel && (scoreLevel.label === "חמור" || scoreLevel.label === "מעל הסף") && (
            <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-5 w-5" />
                  שים לב
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  הציון מצביע על רמה גבוהה של תסמינים. מומלץ לשקול התערבות מתאימה ומעקב צמוד.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
