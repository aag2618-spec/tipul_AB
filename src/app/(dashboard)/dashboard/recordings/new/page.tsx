"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AudioRecorder } from "@/components/recordings/audio-recorder";

interface Client {
  id: string;
  name: string;
}

function NewRecordingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState(searchParams.get("client") || "");
  const [recordingType, setRecordingType] = useState<"INTAKE" | "SESSION">(
    searchParams.get("session") ? "SESSION" : "INTAKE"
  );
  const [sessionId] = useState(searchParams.get("session") || "");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch("/api/clients");
        if (response.ok) {
          const data = await response.json();
          setClients(data);
        }
      } catch (error) {
        console.error("Failed to fetch clients:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
  }, []);

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    if (!selectedClient && recordingType === "INTAKE") {
      toast.error("נא לבחור מטופל");
      return;
    }

    setIsUploading(true);

    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        
        const response = await fetch("/api/recordings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioData: base64,
            mimeType: blob.type,
            durationSeconds: duration,
            type: recordingType,
            clientId: selectedClient || undefined,
            sessionId: sessionId || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error("שגיאה בהעלאת ההקלטה");
        }

        const recording = await response.json();
        toast.success("ההקלטה הועלתה בהצלחה");
        router.push(`/dashboard/recordings/${recording.id}`);
      };
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("שגיאה בהעלאת ההקלטה");
      setIsUploading(false);
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
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/recordings">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הקלטה חדשה</h1>
          <p className="text-muted-foreground">הקלט שיחה עם מטופל</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי ההקלטה</CardTitle>
          <CardDescription>בחר את סוג ההקלטה והמטופל</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>סוג הקלטה</Label>
              <Select
                value={recordingType}
                onValueChange={(v) => setRecordingType(v as "INTAKE" | "SESSION")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTAKE">שיחת קבלה / פתיחת תיק</SelectItem>
                  <SelectItem value="SESSION">הקלטת פגישה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>מטופל</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר מטופל" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <AudioRecorder
        onRecordingComplete={handleRecordingComplete}
        isUploading={isUploading}
      />

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium">לאחר ההקלטה:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>ההקלטה תשלח לתמלול אוטומטי עם Google AI Studio</li>
              <li>תוכל לערוך את התמלול לפני הניתוח</li>
              <li>הניתוח יזהה נושאים מרכזיים, רגשות והמלצות</li>
              <li>כל הנתונים מאובטחים ונשמרים באופן מקומי</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewRecordingPage() {
  return (
    <Suspense fallback={
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <NewRecordingContent />
    </Suspense>
  );
}













