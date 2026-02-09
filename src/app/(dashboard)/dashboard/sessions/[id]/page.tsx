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
import { ArrowRight, Calendar, Clock, User, Mic, FileText, Save, Loader2, Sparkles, Brain, TrendingUp, TrendingDown, Minus, AlertTriangle, MessageCircleQuestion, Lightbulb, Shield, Target, Users } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { CompleteSessionDialog } from "@/components/sessions/complete-session-dialog";
import { SessionPrepCard } from "@/components/ai/session-prep-card";
import { SessionAnalysisButtons } from "@/components/ai/session-analysis-buttons";

interface NoteAnalysis {
  // Plain text analysis (from SessionAnalysis model)
  content?: string;
  analysisType?: string;
  // Structured analysis (legacy format)
  summary?: string;
  keyThemes?: string[];
  clinicalObservations?: string[];
  progressIndicators?: {
    area: string;
    status: "improving" | "stable" | "concerning";
    notes: string;
  }[];
  // תמיכה בפורמט ישן (string[]) וחדש (object[])
  suggestedInterventions?: (string | {
    intervention: string;
    rationale: string;
    howTo: string;
  })[];
  questionsForNextSession?: (string | {
    question: string;
    purpose: string;
    approachStyle: string;
  })[];
  riskFactors?: string[];
  // שדות חדשים לניתוח מפורט (Enterprise)
  therapeuticStage?: {
    currentStage: string;
    stageIndicators: string;
    stageProgress: string;
  };
  sessionDeepAnalysis?: {
    whatActuallyHappened: string;
    therapeuticMoments: string;
    patientExperience: string;
    relationshipDynamics: string;
  };
  therapistBlindSpots?: {
    possibleMisses?: string[];
    unexploredAreas?: string[];
    alternativeInterpretations?: string;
  };
  recommendationsForTherapist?: {
    keyTakeaways?: string[];
    attentionPoints?: string[];
    therapeuticDirection?: string;
  };
  approachAnalysis?: {
    conceptsObserved?: {
      concept: string;
      observation: string;
      significance: string;
    }[];
    newInsights?: string;
    progressInApproach?: string;
  };
  transferenceAnalysis?: {
    transference?: {
      type: string;
      manifestation: string;
      meaning: string;
    };
    countertransference?: {
      feelings: string;
      meaning: string;
      recommendation: string;
    };
  };
  defensesMechanisms?: {
    defense: string;
    approachPerspective: string;
    manifestation: string;
    therapeuticApproach: string;
  }[];
  approachToPatient?: {
    recommendedStance: string;
    whatToExplore: string;
    whatToAvoid: string;
    timing: string;
  };
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
  sessionAnalysis: {
    id: string;
    content: string;
    analysisType: string;
    createdAt: string;
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
          // Load saved AI analysis if exists (from sessionAnalysis table or legacy aiAnalysis field)
          if (data.sessionAnalysis?.content) {
            setNoteAnalysis({ content: data.sessionAnalysis.content, analysisType: data.sessionAnalysis.analysisType });
          } else if (data.sessionNote?.aiAnalysis) {
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
          clientName: session?.client?.name,
          clientId: session?.client?.id 
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


      {/* הכנה לפגישה - מוצג תמיד בראש הדף */}
      {session.client && session.type !== "BREAK" && (
        <div className="mb-6">
          <SessionPrepCard
            session={{
              id: session.id,
              clientId: session.client.id,
              clientName: session.client.name,
              startTime: new Date(session.startTime),
            }}
            userTier={userTier}
          />
        </div>
      )}

      {/* סיכום טיפול + ניתוח AI */}
      <div className="mt-6">
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
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        ניתוח AI
                        {noteAnalysis.analysisType && (
                          <Badge variant="outline" className="text-xs">
                            {noteAnalysis.analysisType === 'CONCISE' ? 'תמציתי' : 'מפורט'}
                          </Badge>
                        )}
                      </CardTitle>
                      <SessionAnalysisButtons
                        sessionId={session.id}
                        userTier={userTier}
                        onAnalysisComplete={() => fetchSession()}
                      />
                    </div>
                    <CardDescription>ניתוח אוטומטי של סיכום הפגישה</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
                    {/* Plain text content (new format) */}
                    {noteAnalysis.content ? (
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {noteAnalysis.content}
                        </div>
                      </div>
                    ) : (
                      /* Structured format (legacy) */
                      <>
                        {/* Summary */}
                        {noteAnalysis.summary && (
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <p className="text-sm">{noteAnalysis.summary}</p>
                          </div>
                        )}

                        {/* Therapeutic Stage - Enterprise */}
                        {noteAnalysis.therapeuticStage && (
                          <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-indigo-700">
                              <Target className="h-4 w-4" />
                              השלב הטיפולי הנוכחי
                            </h4>
                            <div className="space-y-2 text-sm">
                              <p><strong>שלב:</strong> {noteAnalysis.therapeuticStage.currentStage}</p>
                              <p className="text-muted-foreground text-xs">מה מעיד על כך: {noteAnalysis.therapeuticStage.stageIndicators}</p>
                              <p className="text-muted-foreground text-xs">התקדמות: {noteAnalysis.therapeuticStage.stageProgress}</p>
                            </div>
                          </div>
                        )}

                        {/* Session Deep Analysis - Enterprise */}
                        {noteAnalysis.sessionDeepAnalysis && (
                          <div className="p-3 rounded-lg bg-cyan-50 border border-cyan-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-cyan-700">
                              <Brain className="h-4 w-4" />
                              ניתוח עמוק של הפגישה
                            </h4>
                            <div className="space-y-3 text-sm">
                              <div>
                                <p className="font-medium text-cyan-600">מה באמת קרה:</p>
                                <p>{noteAnalysis.sessionDeepAnalysis.whatActuallyHappened}</p>
                              </div>
                              <div>
                                <p className="font-medium text-cyan-600">רגעים טיפוליים משמעותיים:</p>
                                <p>{noteAnalysis.sessionDeepAnalysis.therapeuticMoments}</p>
                              </div>
                              <div>
                                <p className="font-medium text-cyan-600">חוויית המטופל:</p>
                                <p>{noteAnalysis.sessionDeepAnalysis.patientExperience}</p>
                              </div>
                              <div>
                                <p className="font-medium text-cyan-600">דינמיקת הקשר:</p>
                                <p>{noteAnalysis.sessionDeepAnalysis.relationshipDynamics}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Therapist Blind Spots - Enterprise */}
                        {noteAnalysis.therapistBlindSpots && (
                          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-orange-700">
                              <AlertTriangle className="h-4 w-4" />
                              נקודות עיוורות אפשריות
                            </h4>
                            <div className="space-y-2 text-sm">
                              {noteAnalysis.therapistBlindSpots.possibleMisses && noteAnalysis.therapistBlindSpots.possibleMisses.length > 0 && (
                                <div>
                                  <p className="font-medium text-orange-600">דברים שייתכן שלא שמת לב:</p>
                                  <ul className="list-disc list-inside">
                                    {noteAnalysis.therapistBlindSpots.possibleMisses.map((m, i) => (
                                      <li key={i}>{m}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {noteAnalysis.therapistBlindSpots.unexploredAreas && noteAnalysis.therapistBlindSpots.unexploredAreas.length > 0 && (
                                <div>
                                  <p className="font-medium text-orange-600">תחומים שלא נחקרו:</p>
                                  <ul className="list-disc list-inside">
                                    {noteAnalysis.therapistBlindSpots.unexploredAreas.map((a, i) => (
                                      <li key={i}>{a}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {noteAnalysis.therapistBlindSpots.alternativeInterpretations && (
                                <div>
                                  <p className="font-medium text-orange-600">פרשנות אחרת אפשרית:</p>
                                  <p>{noteAnalysis.therapistBlindSpots.alternativeInterpretations}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Key Themes */}
                        {noteAnalysis.keyThemes && noteAnalysis.keyThemes.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">נושאים מרכזיים</h4>
                            <div className="flex flex-wrap gap-2">
                              {noteAnalysis.keyThemes.map((theme, i) => (
                                <Badge key={i} variant="secondary">{theme}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Clinical Observations */}
                        {noteAnalysis.clinicalObservations && noteAnalysis.clinicalObservations.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">תצפיות קליניות</h4>
                            <ul className="text-sm space-y-1">
                              {noteAnalysis.clinicalObservations.map((obs, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-primary mt-0.5">•</span>
                                  {obs}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Progress Indicators */}
                        {noteAnalysis.progressIndicators && noteAnalysis.progressIndicators.length > 0 && (
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

                        {/* Approach Analysis - Enterprise */}
                        {noteAnalysis.approachAnalysis && (
                          <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-purple-700">
                              <Brain className="h-4 w-4" />
                              ניתוח לפי גישה טיפולית
                            </h4>
                            
                            {noteAnalysis.approachAnalysis.newInsights && (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-purple-600 mb-1">תובנות חדשות:</p>
                                <p className="text-sm">{noteAnalysis.approachAnalysis.newInsights}</p>
                              </div>
                            )}

                            {noteAnalysis.approachAnalysis.progressInApproach && (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-purple-600 mb-1">התקדמות לפי הגישה:</p>
                                <p className="text-sm">{noteAnalysis.approachAnalysis.progressInApproach}</p>
                              </div>
                            )}
                            
                            {noteAnalysis.approachAnalysis.conceptsObserved && noteAnalysis.approachAnalysis.conceptsObserved.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-purple-600 mb-2">מושגים שזוהו:</p>
                                <div className="space-y-2">
                                  {noteAnalysis.approachAnalysis.conceptsObserved.map((c, i) => (
                                    <div key={i} className="p-2 bg-white/50 rounded text-sm">
                                      <p className="font-medium">{c.concept}</p>
                                      <p className="text-xs text-muted-foreground">תצפית: {c.observation}</p>
                                      <p className="text-xs text-muted-foreground">משמעות: {c.significance}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Transference Analysis - Enterprise */}
                        {noteAnalysis.transferenceAnalysis && (
                          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-blue-700">
                              <Users className="h-4 w-4" />
                              העברה והעברה נגדית
                            </h4>
                            
                            {noteAnalysis.transferenceAnalysis.transference && (
                              <div className="mb-3 p-2 bg-white/50 rounded">
                                <p className="text-xs font-medium text-blue-600 mb-1">העברה (Transference):</p>
                                <p className="text-sm"><strong>סוג:</strong> {noteAnalysis.transferenceAnalysis.transference.type}</p>
                                <p className="text-xs text-muted-foreground">ביטוי: {noteAnalysis.transferenceAnalysis.transference.manifestation}</p>
                                <p className="text-xs text-muted-foreground">משמעות: {noteAnalysis.transferenceAnalysis.transference.meaning}</p>
                              </div>
                            )}

                            {noteAnalysis.transferenceAnalysis.countertransference && (
                              <div className="p-2 bg-white/50 rounded">
                                <p className="text-xs font-medium text-blue-600 mb-1">העברה נגדית (Countertransference):</p>
                                <p className="text-sm"><strong>תחושות:</strong> {noteAnalysis.transferenceAnalysis.countertransference.feelings}</p>
                                <p className="text-xs text-muted-foreground">משמעות: {noteAnalysis.transferenceAnalysis.countertransference.meaning}</p>
                                <p className="text-xs text-muted-foreground">המלצה: {noteAnalysis.transferenceAnalysis.countertransference.recommendation}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Defense Mechanisms - Enterprise */}
                        {noteAnalysis.defensesMechanisms && noteAnalysis.defensesMechanisms.length > 0 && (
                          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-amber-700">
                              <Shield className="h-4 w-4" />
                              מנגנוני הגנה
                            </h4>
                            <div className="space-y-2">
                              {noteAnalysis.defensesMechanisms.map((d, i) => (
                                <div key={i} className="p-2 bg-white/50 rounded text-sm">
                                  <p className="font-medium">{d.defense}</p>
                                  <p className="text-xs text-muted-foreground">לפי הגישה: {d.approachPerspective}</p>
                                  <p className="text-xs text-muted-foreground">ביטוי: {d.manifestation}</p>
                                  <p className="text-xs text-muted-foreground">גישה טיפולית: {d.therapeuticApproach}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Approach to Patient - Enterprise */}
                        {noteAnalysis.approachToPatient && (
                          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-green-700">
                              <Target className="h-4 w-4" />
                              גישה מומלצת למטופל
                            </h4>
                            <div className="space-y-2 text-sm">
                              <p><strong>עמדה מומלצת:</strong> {noteAnalysis.approachToPatient.recommendedStance}</p>
                              <p><strong>מה לחקור:</strong> {noteAnalysis.approachToPatient.whatToExplore}</p>
                              <p><strong>ממה להיזהר:</strong> {noteAnalysis.approachToPatient.whatToAvoid}</p>
                              <p><strong>עיתוי:</strong> {noteAnalysis.approachToPatient.timing}</p>
                            </div>
                          </div>
                        )}

                        {/* Recommendations for Therapist - Enterprise */}
                        {noteAnalysis.recommendationsForTherapist && (
                          <div className="p-3 rounded-lg bg-teal-50 border border-teal-200">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-teal-700">
                              <Lightbulb className="h-4 w-4" />
                              המלצות למטפל
                            </h4>
                            <div className="space-y-2 text-sm">
                              {noteAnalysis.recommendationsForTherapist.keyTakeaways && noteAnalysis.recommendationsForTherapist.keyTakeaways.length > 0 && (
                                <div>
                                  <p className="font-medium text-teal-600">מסקנות מרכזיות:</p>
                                  <ul className="list-disc list-inside">
                                    {noteAnalysis.recommendationsForTherapist.keyTakeaways.map((t, i) => (
                                      <li key={i}>{t}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {noteAnalysis.recommendationsForTherapist.attentionPoints && noteAnalysis.recommendationsForTherapist.attentionPoints.length > 0 && (
                                <div>
                                  <p className="font-medium text-teal-600">נקודות לתשומת לב:</p>
                                  <ul className="list-disc list-inside">
                                    {noteAnalysis.recommendationsForTherapist.attentionPoints.map((p, i) => (
                                      <li key={i}>{p}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {noteAnalysis.recommendationsForTherapist.therapeuticDirection && (
                                <div>
                                  <p className="font-medium text-teal-600">כיוון טיפולי מומלץ:</p>
                                  <p>{noteAnalysis.recommendationsForTherapist.therapeuticDirection}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Suggested Interventions */}
                        {noteAnalysis.suggestedInterventions && noteAnalysis.suggestedInterventions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Lightbulb className="h-4 w-4" />
                              התערבויות מומלצות
                            </h4>
                            <ul className="text-sm space-y-2">
                              {noteAnalysis.suggestedInterventions.map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-primary mt-0.5">•</span>
                                  {typeof item === 'string' ? (
                                    <span>{item}</span>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="font-medium">{item.intervention}</div>
                                      <div className="text-muted-foreground text-xs">נימוק: {item.rationale}</div>
                                      <div className="text-muted-foreground text-xs">איך לבצע: {item.howTo}</div>
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Questions for Next Session */}
                        {noteAnalysis.questionsForNextSession && noteAnalysis.questionsForNextSession.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <MessageCircleQuestion className="h-4 w-4" />
                              שאלות לפגישה הבאה
                            </h4>
                            <ul className="text-sm space-y-2">
                              {noteAnalysis.questionsForNextSession.map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-primary mt-0.5">•</span>
                                  {typeof item === 'string' ? (
                                    <span>{item}</span>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="font-medium">{item.question}</div>
                                      <div className="text-muted-foreground text-xs">מטרה: {item.purpose}</div>
                                      <div className="text-muted-foreground text-xs">סגנון: {item.approachStyle}</div>
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Risk Factors */}
                        {noteAnalysis.riskFactors && noteAnalysis.riskFactors.length > 0 && noteAnalysis.riskFactors[0] !== "" && (
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
                      </>
                    )}
                  </CardContent>
                </>
              ) : (
                <div className="text-center text-muted-foreground p-6">
                  <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">ניתוח AI</p>
                  <p className="text-sm mt-1 mb-4">כתוב סיכום ולחץ על &quot;נתח עם AI&quot; או בחר ניתוח מעמיק:</p>
                  <SessionAnalysisButtons
                    sessionId={session.id}
                    userTier={userTier}
                    onAnalysisComplete={() => fetchSession()}
                  />
                </div>
              )}
            </Card>
          </div>
        </div>


    </div>
  );
}













