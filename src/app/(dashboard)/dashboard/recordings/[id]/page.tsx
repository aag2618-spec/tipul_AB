"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ArrowRight, Loader2, Mic, Clock, User, Play, FileText, Brain, AlertCircle, Download, Trash2, RefreshCw, Pencil, Save } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

interface Recording {
  id: string;
  audioUrl: string;
  durationSeconds: number;
  type: string;
  status: string;
  createdAt: string;
  client: { id: string; name: string } | null;
  session: { id: string; startTime: string } | null;
  transcription: {
    id: string;
    content: string;
    language: string;
    confidence: number | null;
    createdAt: string;
    analysis: {
      id: string;
      summary: string;
      keyTopics: string[] | null;
      emotionalMarkers: Array<{emotion: string; intensity: string; context: string}> | null;
      recommendations: string[] | null;
      nextSessionNotes: string | null;
    } | null;
  } | null;
}

export default function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState("");
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);

  useEffect(() => {
    fetchRecording();
  }, [id]);

  const fetchRecording = async () => {
    try {
      const response = await fetch(`/api/recordings/${id}`);
      if (response.ok) {
        const data = await response.json();
        setRecording(data);
      }
    } catch (error) {
      console.error("Failed to fetch recording:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: id }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.message || "שגיאה בתמלול";
        console.error("Transcribe API error:", errorMsg);
        throw new Error(errorMsg);
      }

      toast.success("התמלול הושלם בהצלחה");
      fetchRecording();
    } catch (error) {
      console.error("Transcribe error:", error);
      const errorMessage = error instanceof Error ? error.message : "אירעה שגיאה בתמלול";
      toast.error(errorMessage);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!recording?.transcription) return;
    
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptionId: recording.transcription.id }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בניתוח");
      }

      toast.success("הניתוח הושלם בהצלחה");
      fetchRecording();
    } catch (error) {
      console.error("Analyze error:", error);
      toast.error("אירעה שגיאה בניתוח");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: id, force: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.message || "שגיאה בתמלול";
        throw new Error(errorMsg);
      }

      toast.success("התמלול החדש הושלם בהצלחה");
      fetchRecording();
    } catch (error) {
      console.error("Re-transcribe error:", error);
      const errorMessage = error instanceof Error ? error.message : "אירעה שגיאה בתמלול";
      toast.error(errorMessage);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("שגיאה במחיקה");
      }

      toast.success("ההקלטה נמחקה בהצלחה");
      router.push("/dashboard/recordings");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("אירעה שגיאה במחיקת ההקלטה");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = () => {
    if (!recording) return;
    
    const link = document.createElement("a");
    link.href = `/api${recording.audioUrl}`;
    link.download = `recording-${recording.id}.${recording.audioUrl.split('.').pop()}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("ההורדה החלה");
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary">ממתין לתמלול</Badge>;
      case "TRANSCRIBING":
        return <Badge variant="secondary">מתמלל...</Badge>;
      case "TRANSCRIBED":
        return <Badge variant="outline">תומלל</Badge>;
      case "ANALYZED":
        return <Badge variant="default">נותח</Badge>;
      case "ERROR":
        return <Badge variant="destructive">שגיאה</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">הקלטה לא נמצאה</p>
        <Button asChild>
          <Link href="/dashboard/recordings">חזרה להקלטות</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/recordings">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {recording.type === "INTAKE" ? "שיחת קבלה" : "הקלטת פגישה"}
              </h1>
              {getStatusBadge(recording.status)}
            </div>
            <div className="flex items-center gap-4 text-muted-foreground">
              {recording.client && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {recording.client.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDuration(recording.durationSeconds)}
              </span>
              <span>{format(new Date(recording.createdAt), "dd/MM/yyyy HH:mm")}</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          {/* Transcribe button - for pending or error status */}
          {(recording.status === "PENDING" || recording.status === "ERROR") && (
            <Button onClick={handleTranscribe} disabled={isTranscribing}>
              {isTranscribing ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מתמלל...
                </>
              ) : (
                <>
                  <FileText className="ml-2 h-4 w-4" />
                  תמלל
                </>
              )}
            </Button>
          )}
          
          {/* Re-transcribe button - for already transcribed recordings */}
          {(recording.status === "TRANSCRIBED" || recording.status === "ANALYZED") && (
            <Button variant="outline" onClick={handleReTranscribe} disabled={isTranscribing}>
              {isTranscribing ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מתמלל...
                </>
              ) : (
                <>
                  <RefreshCw className="ml-2 h-4 w-4" />
                  תמלל מחדש
                </>
              )}
            </Button>
          )}
          
          {/* Analyze button */}
          {recording.status === "TRANSCRIBED" && !recording.transcription?.analysis && (
            <Button onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מנתח...
                </>
              ) : (
                <>
                  <Brain className="ml-2 h-4 w-4" />
                  נתח
                </>
              )}
            </Button>
          )}

          {/* Download button */}
          <Button variant="outline" onClick={handleDownload}>
            <Download className="ml-2 h-4 w-4" />
            הורד
          </Button>

          {/* Delete button with confirmation */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>האם אתה בטוח?</AlertDialogTitle>
                <AlertDialogDescription>
                  פעולה זו תמחק את ההקלטה, התמלול והניתוח לצמיתות. לא ניתן לשחזר.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  מחק
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Audio Player */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            הקלטה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <audio
            src={`/api${recording.audioUrl}`}
            controls
            className="w-full"
            controlsList="nodownload"
          >
            הדפדפן שלך לא תומך בנגן אודיו.
          </audio>
        </CardContent>
      </Card>

      {/* Transcription & Analysis */}
      {(recording.transcription || recording.status === "TRANSCRIBED" || recording.status === "ANALYZED") && (
        <Tabs defaultValue="transcription" className="w-full">
          <TabsList>
            <TabsTrigger value="transcription" className="gap-2">
              <FileText className="h-4 w-4" />
              תמלול
            </TabsTrigger>
            {recording.transcription?.analysis && (
              <TabsTrigger value="analysis" className="gap-2">
                <Brain className="h-4 w-4" />
                ניתוח
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="transcription" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>תמלול</CardTitle>
                    {recording.transcription?.confidence && (
                      <CardDescription>
                        רמת ביטחון: {Math.round(recording.transcription.confidence * 100)}%
                      </CardDescription>
                    )}
                  </div>
                  {recording.transcription && !isEditingTranscript && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditingTranscript(true);
                        setEditedTranscript(recording.transcription!.content);
                      }}
                      className="gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      ערוך
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {recording.transcription ? (
                  isEditingTranscript ? (
                    <div className="space-y-4">
                      <RichTextEditor
                        content={editedTranscript}
                        onChange={setEditedTranscript}
                        placeholder="ערוך את התמלול..."
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsEditingTranscript(false);
                            setEditedTranscript("");
                          }}
                        >
                          ביטול
                        </Button>
                        <Button
                          onClick={async () => {
                            setIsSavingTranscript(true);
                            try {
                              const response = await fetch(`/api/transcribe/${recording.transcription!.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ content: editedTranscript }),
                              });
                              if (!response.ok) throw new Error("שגיאה בשמירה");
                              toast.success("התמלול עודכן בהצלחה");
                              setIsEditingTranscript(false);
                              fetchRecording();
                            } catch (error) {
                              toast.error("שגיאה בעדכון התמלול");
                            } finally {
                              setIsSavingTranscript(false);
                            }
                          }}
                          disabled={isSavingTranscript}
                          className="gap-2"
                        >
                          {isSavingTranscript ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          שמור
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                      {recording.transcription.content}
                    </div>
                  )
                ) : (
                  <p className="text-muted-foreground">אין תמלול זמין</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {recording.transcription?.analysis && (
            <TabsContent value="analysis" className="mt-6 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>סיכום</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{recording.transcription.analysis.summary}</p>
                </CardContent>
              </Card>

              {recording.transcription.analysis.keyTopics && (
                <Card>
                  <CardHeader>
                    <CardTitle>נושאים מרכזיים</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {(recording.transcription.analysis.keyTopics as string[]).map((topic, i) => (
                        <Badge key={i} variant="secondary">{topic}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {recording.transcription.analysis.emotionalMarkers && (
                <Card>
                  <CardHeader>
                    <CardTitle>סמנים רגשיים</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {recording.transcription.analysis.emotionalMarkers.map((marker, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Badge variant="outline">{marker.emotion}</Badge>
                          <Badge variant={marker.intensity === 'high' ? 'destructive' : marker.intensity === 'medium' ? 'default' : 'secondary'}>
                            {marker.intensity === 'high' ? 'גבוה' : marker.intensity === 'medium' ? 'בינוני' : 'נמוך'}
                          </Badge>
                          <span className="text-sm text-muted-foreground">{marker.context}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {recording.transcription.analysis.recommendations && (
                <Card>
                  <CardHeader>
                    <CardTitle>המלצות</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-1">
                      {(recording.transcription.analysis.recommendations as string[]).map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {recording.transcription.analysis.nextSessionNotes && (
                <Card>
                  <CardHeader>
                    <CardTitle>הערות לפגישה הבאה</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">
                      {recording.transcription.analysis.nextSessionNotes}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

