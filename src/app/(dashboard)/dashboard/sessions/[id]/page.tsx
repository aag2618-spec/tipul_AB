"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, User, Save, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { CompleteSessionDialog } from "@/components/sessions/complete-session-dialog";

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
  } | null;
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
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'idle'>('idle');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef<string>("");

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${id}`);
        if (response.ok) {
          const data = await response.json();
          setSession(data);
          setNoteContent(data.sessionNote?.content || "");
          // אתחול מצב השמירה: מסמן את התוכן הטעון כ"שמור" כדי שלא תוצג תווית
          // "שינויים לא שמורים" מיד עם פתיחת פגישה שכבר שמורה.
          lastSavedContent.current = data.sessionNote?.content || "";
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

    fetchSession();
  }, [id, router]);

  // Auto-save: שמירה אוטומטית כל 30 שניות
  const hasExistingNote = useRef(false);
  useEffect(() => {
    hasExistingNote.current = !!session?.sessionNote;
  }, [session?.sessionNote]);

  const autoSave = useCallback(async (content: string) => {
    if (!content.trim() || content === lastSavedContent.current) return;
    setAutoSaveStatus('saving');
    try {
      const response = await fetch(`/api/sessions/${id}/note`, {
        method: hasExistingNote.current ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (response.ok) {
        lastSavedContent.current = content;
        hasExistingNote.current = true;
        setAutoSaveStatus('saved');
      }
    } catch {
      setAutoSaveStatus('unsaved');
    }
  }, [id]);

  useEffect(() => {
    if (!noteContent.trim() || noteContent === lastSavedContent.current) return;
    setAutoSaveStatus('unsaved');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => autoSave(noteContent), 30000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [noteContent, autoSave]);

  // Initialize lastSavedContent when session loads
  useEffect(() => {
    if (session?.sessionNote?.content) {
      lastSavedContent.current = session.sessionNote.content;
    }
  }, [session?.sessionNote?.content]);

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
        body: JSON.stringify({ content: noteContent }),
      });

      if (!response.ok) throw new Error();

      lastSavedContent.current = noteContent;
      setAutoSaveStatus('saved');
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
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
      }
    } catch {
      toast.error("שגיאה ברענון הפגישה");
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

  const isFutureSession = new Date(session.startTime) > new Date() && (session.status === "SCHEDULED" || session.status === "PENDING_APPROVAL");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
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

      {/* סיכום הטיפול — רק לפגישות שכבר עברו */}
      {!isFutureSession && (
        <div className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>סיכום הטיפול</CardTitle>
                <CardDescription>
                  {session.sessionNote ? "ערוך את סיכום הפגישה" : "כתוב סיכום לפגישה"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {autoSaveStatus === 'saved' && (
                  <span className="text-xs text-green-600">נשמר</span>
                )}
                {autoSaveStatus === 'unsaved' && (
                  <span className="text-xs text-orange-500">שינויים לא שמורים</span>
                )}
                {autoSaveStatus === 'saving' && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    שמירה אוטומטית...
                  </span>
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
