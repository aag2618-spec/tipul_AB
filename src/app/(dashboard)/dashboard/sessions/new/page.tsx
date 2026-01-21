"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, Save, FileText } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";

interface Client {
  id: string;
  name: string;
}

interface Session {
  id: string;
  startTime: string;
  client: { id: string; name: string };
}

function NewSessionNoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedClient, setSelectedClient] = useState(searchParams.get("client") || "");
  const [selectedSession, setSelectedSession] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientsRes, sessionsRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/sessions?status=COMPLETED"),
        ]);

        if (clientsRes.ok) {
          setClients(await clientsRes.json());
        }
        if (sessionsRes.ok) {
          setSessions(await sessionsRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter sessions by selected client
  const filteredSessions = selectedClient
    ? sessions.filter((s) => s.client.id === selectedClient)
    : sessions;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSession || !noteContent.trim()) {
      toast.error("נא לבחור פגישה ולכתוב סיכום");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/sessions/${selectedSession}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteContent }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בשמירה");
      }

      toast.success("הסיכום נשמר בהצלחה");
      
      // Navigate to session or client page
      if (selectedClient) {
        router.push(`/dashboard/clients/${selectedClient}`);
      } else {
        router.push(`/dashboard/sessions/${selectedSession}`);
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("אירעה שגיאה בשמירה");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/sessions">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">סיכום פגישה חדש</h1>
          <p className="text-muted-foreground">כתוב סיכום לפגישה שהסתיימה</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>בחר פגישה</CardTitle>
            <CardDescription>בחר את הפגישה לכתיבת הסיכום</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מטופל</Label>
                <Select
                  value={selectedClient}
                  onValueChange={(v) => {
                    setSelectedClient(v);
                    setSelectedSession("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="כל המטופלים" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">כל המטופלים</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>פגישה</Label>
                <Select value={selectedSession} onValueChange={setSelectedSession}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר פגישה" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSessions.length > 0 ? (
                      filteredSessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.client?.name || "🌊 הפסקה"} - {new Date(session.startTime).toLocaleDateString("he-IL")}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>
                        אין פגישות זמינות
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>כתיבת סיכום</CardTitle>
            <CardDescription>תעד את מהלך הפגישה והנקודות העיקריות</CardDescription>
          </CardHeader>
          <CardContent>
            <RichTextEditor
              content={noteContent}
              onChange={setNoteContent}
              placeholder="כתוב את סיכום הפגישה כאן..."
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            ביטול
          </Button>
          <Button type="submit" disabled={isSaving || !selectedSession}>
            {isSaving ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                שמור סיכום
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewSessionNotePage() {
  return (
    <Suspense
      fallback={
        <div className="h-[50vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NewSessionNoteContent />
    </Suspense>
  );
}







