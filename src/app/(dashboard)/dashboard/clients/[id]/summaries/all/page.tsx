"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { 
  ArrowRight, 
  Calendar, 
  Sparkles, 
  Loader2, 
  ChevronRight,
  FileText,
  Brain,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import Link from "next/link";

interface SessionNote {
  id: string;
  content: string;
  createdAt: string;
}

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  sessionNote: SessionNote | null;
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  therapySessions: Session[];
}

export default function AllSummariesPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  const fetchClient = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data);
      } else {
        toast.error("שגיאה בטעינת הנתונים");
      }
    } catch (error) {
      console.error("Error fetching client:", error);
      toast.error("שגיאה בטעינת הנתונים");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAIAnalysis = async () => {
    if (!client) return;
    
    setIsAnalyzing(true);
    try {
      // Get all session notes content
      const summaries = client.therapySessions
        .filter(s => s.sessionNote)
        .map(s => ({
          date: format(new Date(s.startTime), "d/M/yyyy"),
          content: s.sessionNote!.content
        }));

      const response = await fetch("/api/analyze/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaries,
          clientName: `${client.firstName} ${client.lastName}`,
          analysisType: "comprehensive"
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiAnalysis(data.analysis);
        toast.success("הניתוח הושלם בהצלחה");
      } else {
        toast.error("שגיאה בביצוע הניתוח");
      }
    } catch (error) {
      console.error("Error analyzing summaries:", error);
      toast.error("שגיאה בביצוע הניתוח");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">מטופל לא נמצא</p>
      </div>
    );
  }

  const allSessionsWithNotes = client.therapySessions
    .filter(s => s.sessionNote)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  // Filter by search query
  const sessionsWithNotes = searchQuery.trim()
    ? allSessionsWithNotes.filter(s => {
        const query = searchQuery.toLowerCase();
        const content = s.sessionNote?.content.toLowerCase() || "";
        const date = format(new Date(s.startTime), "d/M/yyyy");
        return content.includes(query) || date.includes(query);
      })
    : allSessionsWithNotes;

  return (
    <div className="container max-w-4xl py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/clients/${clientId}`}>
                <ChevronRight className="h-4 w-4 ml-1" />
                חזור לתיק המטופל
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold">
            כל הסיכומים - {client.firstName} {client.lastName}
          </h1>
          <p className="text-muted-foreground mt-1">
            {allSessionsWithNotes.length} פגישות מסוכמות
            {searchQuery && ` (מוצגות ${sessionsWithNotes.length})`}
          </p>
        </div>
        
        {allSessionsWithNotes.length > 0 && (
          <Button 
            onClick={handleAIAnalysis} 
            disabled={isAnalyzing}
            size="lg"
            className="gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                מנתח...
              </>
            ) : (
              <>
                <Brain className="h-5 w-5" />
                ניתוח AI מעמיק
              </>
            )}
          </Button>
        )}
      </div>

      {/* Search Bar */}
      {allSessionsWithNotes.length > 0 && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="חפש בסיכומים... (מילות מפתח, תאריכים)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>
      )}

      {/* All Summaries in Sequence */}
      <div className="space-y-6">
        {sessionsWithNotes.length > 0 ? (
          <>
            {sessionsWithNotes.map((session, index) => (
              <Card key={session.id} className="border-2">
                <CardHeader className="bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-lg px-3 py-1">
                        #{index + 1}
                      </Badge>
                      <div>
                        <CardTitle className="text-lg">
                          {format(new Date(session.startTime), "EEEE, d בMMMM yyyy", { locale: he })}
                        </CardTitle>
                        <CardDescription>
                          {format(new Date(session.startTime), "HH:mm")} - {format(new Date(session.endTime), "HH:mm")}
                        </CardDescription>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/sessions/${session.id}`}>
                        <FileText className="h-4 w-4 ml-2" />
                        ערוך
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="prose prose-slate max-w-none">
                    <div className="whitespace-pre-wrap text-base leading-relaxed">
                      {session.sessionNote?.content}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Separator before AI Analysis */}
            {aiAnalysis && (
              <>
                <Separator className="my-8" />
                
                {/* AI Analysis Section */}
                <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Brain className="h-7 w-7 text-purple-600" />
                      ניתוח AI מעמיק של כל הטיפול
                    </CardTitle>
                    <CardDescription>
                      ניתוח כולל של {sessionsWithNotes.length} פגישות טיפוליות
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-slate max-w-none bg-white rounded-lg p-6 shadow-sm">
                      <div className="whitespace-pre-wrap text-base leading-relaxed">
                        {aiAnalysis}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              {searchQuery ? (
                <>
                  <Search className="mx-auto h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-lg text-muted-foreground">לא נמצאו תוצאות עבור "{searchQuery}"</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setSearchQuery("")}
                  >
                    נקה חיפוש
                  </Button>
                </>
              ) : (
                <>
                  <FileText className="mx-auto h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-lg text-muted-foreground">אין סיכומים עדיין</p>
                  <Button variant="link" asChild className="mt-4">
                    <Link href={`/dashboard/clients/${clientId}?tab=summaries`}>
                      חזור לתיק המטופל
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
