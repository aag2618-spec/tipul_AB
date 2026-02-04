"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Calendar, Clock, User, Mic, FileText, Save, Loader2, Sparkles, Brain, TrendingUp, TrendingDown, Minus, AlertTriangle, MessageCircleQuestion, Lightbulb } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { CompleteSessionDialog } from "@/components/sessions/complete-session-dialog";
import { SessionPrepCard } from "@/components/ai/session-prep-card";

interface NoteAnalysis {
  summary: string;
  keyThemes: string[];
  clinicalObservations: string[];
  progressIndicators: {
    area: string;
    status: "improving" | "stable" | "concerning";
    notes: string;
  }[];
  suggestedInterventions: string[];
  questionsForNextSession: string[];
  riskFactors: string[];
}

interface SessionData {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  notes: string | null;
  client: {
    id: string;
    name: string;
  } | null;
  sessionNote: {
    id: string;
    content: string;
    isPrivate: boolean;
    aiAnalysis: NoteAnalysis | null;
  } | null;
  recordings: {
    id: string;
    durationSeconds: number;
    status: string;
    transcription: {
      content: string;
      analysis: {
        summary: string;
        keyTopics: string[];
        recommendations: string[];
      } | null;
    } | null;
  }[];
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [status, setStatus] = useState("");
  const [noteAnalysis, setNoteAnalysis] = useState<NoteAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [userTier, setUserTier] = useState<'ESSENTIAL' | 'PRO' | 'ENTERPRISE'>('ESSENTIAL');

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${id}`);
        if (response.ok) {
          const data = await response.json();
          setSession(data);
          setNoteContent(data.sessionNote?.content || "");
          setStatus(data.status);
          // Load saved AI analysis if exists
          if (data.sessionNote?.aiAnalysis) {
            setNoteAnalysis(data.sessionNote.aiAnalysis);
          }
        } else {
          toast.error("פגישה לא נמצאה");
          router.push("/dashboard/sessions");
        }
      } catch {
        toast.error("שגיאה בטעינת הפגישה");
      } finally {
        setIsLoading(false);
      }
    };

    const fetchUserTier = async () => {
      try {
        const response = await fetch('/api/user/tier');
        if (response.ok) {
          const data = await response.json();
          setUserTier(data.aiTier || 'ESSENTIAL');
        }
      } catch {
        console.error('Failed to fetch user tier');
      }
    };

    fetchSession();
    fetchUserTier();
  }, [id, router]);

  const handleSaveNote = async () => {
    if (!noteContent.trim()) {
      toast.error("נא להזין תוכן לסיכום");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/sessions/${id}/note`, {
        method: session?.sessionNote ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: noteContent,
          aiAnalysis: noteAnalysis || null,
        }),
      });

      if (!response.ok) throw new Error();

      toast.success("הסיכום נשמר בהצלחה");
      
      // Refresh session data
      const updatedSession = await fetch(`/api/sessions/${id}`).then(r => r.json());
      setSession(updatedSession);
    } catch {
      toast.error("שגיאה בשמירת הסיכום");
    } finally {
      setIsSaving(false);
    }
  };

  const refreshSession = async () => {
    try {
      const response = await fetch(`/api/sessions/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data);
        setStatus(data.status);
      }
    } catch {
      toast.error("שגיאה ברענון הפגישה");
    }
  };

  const handleGenerateSummary = async () => {
    const transcription = session?.recordings?.[0]?.transcription?.content;
    if (!transcription) {
      toast.error("אין תמלול זמין ליצירת סיכום");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/analyze/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcription }),
      });

      if (!response.ok) throw new Error();

      const { summary } = await response.json();
      setNoteContent(summary);
      toast.success("סיכום נוצר בהצלחה");
    } catch {
      toast.error("שגיאה ביצירת הסיכום");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyzeNote = async () => {
    if (!noteContent || noteContent.trim().length < 10) {
      toast.error("נא לכתוב סיכום מפורט יותר לפני הניתוח");
      return;
    }

    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/analyze/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          noteContent,
          clientName: session?.client?.name 
        }),
      });

      if (!response.ok) throw new Error();

      const { analysis } = await response.json();
      setNoteAnalysis(analysis);
      toast.success("הניתוח הושלם בהצלחה");
    } catch {
      toast.error("שגיאה בניתוח הסיכום");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  const hasTranscription = session.recordings?.some(r => r.transcription);
  const analysis = session.recordings?.[0]?.transcription?.analysis;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/sessions">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {session.type === "BREAK" ? "🌊 הפסקה" : `פגישה עם ${session.client?.name || "מטופל"}`}
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {format(new Date(session.startTime), "EEEE, d בMMMM yyyy", { locale: he })}
              <Clock className="h-4 w-4 mr-2" />
              {format(new Date(session.startTime), "HH:mm")} - {format(new Date(session.endTime), "HH:mm")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session.status === "SCHEDULED" && (
            <CompleteSessionDialog
              session={{
                id: session.id,
                startTime: session.startTime,
                endTime: session.endTime,
                client: session.client,
                price: session.price,
              }}
              onSuccess={refreshSession}
            />
          )}
          {session.status !== "SCHEDULED" && (
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-200 dark:border-blue-800 shadow-md">
              <CardContent className="p-4">
                <Badge variant={
                  status === "COMPLETED" ? "default" :
                  status === "CANCELLED" ? "destructive" : "secondary"
                } className="text-base px-4 py-2">
                  {status === "COMPLETED" ? "✅ הושלם" :
                   status === "CANCELLED" ? "❌ בוטל" : "⚠️ אי הופעה"}
                </Badge>
              </CardContent>
            </Card>
          )}
          {session.client && (
            <Button variant="outline" asChild>
              <Link href={`/dashboard/clients/${session.client.id}`}>
                <User className="ml-2 h-4 w-4" />
                תיק מטופל
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Session Info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">סוג פגישה</p>
            <p className="text-lg font-medium">
              {session.type === "ONLINE" ? "אונליין" : session.type === "PHONE" ? "טלפון" : "פרונטלי"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">מחיר</p>
            <p className="text-lg font-medium">₪{session.price}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">סטטוס</p>
            <Badge variant={
              status === "COMPLETED" ? "default" :
              status === "CANCELLED" ? "destructive" : "secondary"
            } className="mt-1">
              {status === "SCHEDULED" ? "מתוכנן" :
               status === "COMPLETED" ? "הושלם" :
               status === "CANCELLED" ? "בוטל" : "אי הופעה"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">הקלטות</p>
            <p className="text-lg font-medium">{session.recordings?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="prep" className="w-full">
        <TabsList>
          {session.client && session.type !== "BREAK" && (
            <TabsTrigger value="prep" className="gap-2">
              <Brain className="h-4 w-4" />
              הכנה לפגישה
            </TabsTrigger>
          )}
          <TabsTrigger value="note" className="gap-2">
            <FileText className="h-4 w-4" />
            סיכום טיפול
          </TabsTrigger>
          {hasTranscription && (
            <TabsTrigger value="analysis" className="gap-2">
              <Sparkles className="h-4 w-4" />
              ניתוח AI
            </TabsTrigger>
          )}
          <TabsTrigger value="recordings" className="gap-2">
            <Mic className="h-4 w-4" />
            הקלטות
          </TabsTrigger>
        </TabsList>

        {/* AI Session Prep Tab */}
        {session.client && session.type !== "BREAK" && (
          <TabsContent value="prep" className="mt-6">
            <SessionPrepCard
              session={{
                id: session.id,
                clientId: session.client.id,
                clientName: session.client.name,
                startTime: new Date(session.startTime),
              }}
              userTier={userTier}
            />
          </TabsContent>
        )}

        <TabsContent value="note" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left side - Note Editor */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>סיכום הטיפול</CardTitle>
                  <CardDescription>
                    {session.sessionNote ? "ערוך את סיכום הפגישה" : "כתוב סיכום לפגישה"}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {hasTranscription && (
                    <Button variant="outline" size="sm" onClick={handleGenerateSummary} disabled={isSaving}>
                      <Sparkles className="ml-2 h-4 w-4" />
                      מתמלול
                    </Button>
                  )}
                  <Button size="sm" onClick={handleSaveNote} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        שומר...
                      </>
                    ) : (
                      <>
                        <Save className="ml-2 h-4 w-4" />
                        שמור
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <RichTextEditor
                  content={noteContent}
                  onChange={setNoteContent}
                  placeholder="כתוב כאן את סיכום הפגישה..."
                />
                <div className="mt-4">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleAnalyzeNote} 
                    disabled={isAnalyzing || !noteContent.trim()}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        מנתח את הסיכום...
                      </>
                    ) : (
                      <>
                        <Brain className="ml-2 h-4 w-4" />
                        נתח עם AI
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right side - AI Analysis */}
            <Card className={noteAnalysis ? "" : "flex items-center justify-center min-h-[400px]"}>
              {noteAnalysis ? (
                <>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      ניתוח AI
                    </CardTitle>
                    <CardDescription>ניתוח אוטומטי של סיכום הפגישה</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
                    {/* Summary */}
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-sm">{noteAnalysis.summary}</p>
                    </div>

                    {/* Key Themes */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">נושאים מרכזיים</h4>
                      <div className="flex flex-wrap gap-2">
                        {noteAnalysis.keyThemes?.map((theme, i) => (
                          <Badge key={i} variant="secondary">{theme}</Badge>
                        ))}
                      </div>
                    </div>

                    {/* Clinical Observations */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">תצפיות קליניות</h4>
                      <ul className="text-sm space-y-1">
                        {noteAnalysis.clinicalObservations?.map((obs, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            {obs}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Progress Indicators */}
                    {noteAnalysis.progressIndicators?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">מדדי התקדמות</h4>
                        <div className="space-y-2">
                          {noteAnalysis.progressIndicators.map((indicator, i) => (
                            <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                              {indicator.status === "improving" && (
                                <TrendingUp className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                              )}
                              {indicator.status === "stable" && (
                                <Minus className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                              )}
                              {indicator.status === "concerning" && (
                                <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                              )}
                              <div>
                                <p className="font-medium text-sm">{indicator.area}</p>
                                <p className="text-xs text-muted-foreground">{indicator.notes}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggested Interventions */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        התערבויות מומלצות
                      </h4>
                      <ul className="text-sm space-y-1">
                        {noteAnalysis.suggestedInterventions?.map((intervention, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            {intervention}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Questions for Next Session */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <MessageCircleQuestion className="h-4 w-4" />
                        שאלות לפגישה הבאה
                      </h4>
                      <ul className="text-sm space-y-1">
                        {noteAnalysis.questionsForNextSession?.map((question, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            {question}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Risk Factors */}
                    {noteAnalysis.riskFactors?.length > 0 && noteAnalysis.riskFactors[0] !== "" && (
                      <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-red-700">
                          <AlertTriangle className="h-4 w-4" />
                          גורמי סיכון
                        </h4>
                        <ul className="text-sm space-y-1 text-red-700">
                          {noteAnalysis.riskFactors.map((risk, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="mt-0.5">•</span>
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </>
              ) : (
                <div className="text-center text-muted-foreground p-6">
                  <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">ניתוח AI</p>
                  <p className="text-sm mt-1">כתוב סיכום ולחץ על &quot;נתח עם AI&quot;</p>
                  <p className="text-sm">לקבלת תובנות וניתוח מקצועי</p>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {hasTranscription && analysis && (
          <TabsContent value="analysis" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>סיכום</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{analysis.summary}</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>נושאים מרכזיים</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {analysis.keyTopics?.map((topic, i) => (
                      <Badge key={i} variant="secondary">{topic}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>המלצות</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1">
                    {analysis.recommendations?.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        <TabsContent value="recordings" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>הקלטות הפגישה</CardTitle>
                <CardDescription>
                  {session.recordings?.length || 0} הקלטות
                </CardDescription>
              </div>
              {session.client && (
                <Button asChild>
                  <Link href={`/dashboard/recordings/new?session=${session.id}&client=${session.client.id}`}>
                    <Mic className="ml-2 h-4 w-4" />
                    הקלטה חדשה
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {session.recordings?.length > 0 ? (
                <div className="space-y-3">
                  {session.recordings.map((recording) => (
                    <div
                      key={recording.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Mic className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {Math.floor(recording.durationSeconds / 60)} דקות
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {recording.transcription ? "תומלל" : "ממתין לתמלול"}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" asChild>
                        <Link href={`/dashboard/recordings/${recording.id}`}>
                          צפה
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Mic className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין הקלטות לפגישה זו</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


    </div>
  );
}













