"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, Save, FileText } from "lucide-react";
import { toast } from "sonner";

interface Client {
  id: string;
  name: string;
  intakeNotes: string | null;
}

interface IntakeTemplate {
  id: string;
  name: string;
  questions: { question: string; type: string }[];
}

// Default intake questions
const DEFAULT_QUESTIONS = [
  "מה הביא אותך לפנות לטיפול עכשיו?",
  "תאר/י את הבעיה המרכזית שאת/ה חווה",
  "מתי הבעיה התחילה?",
  "האם קיבלת טיפול בעבר? אם כן, איזה סוג?",
  "האם אתה/את לוקח/ת תרופות? אם כן, אילו?",
  "מה הציפיות שלך מהטיפול?",
  "האם יש משהו נוסף שחשוב לי לדעת?",
];

export default function IntakePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [templates, setTemplates] = useState<IntakeTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Get current questions
  const currentQuestions = selectedTemplate
    ? templates.find((t) => t.id === selectedTemplate)?.questions.map((q) => q.question) || DEFAULT_QUESTIONS
    : DEFAULT_QUESTIONS;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientRes, templatesRes] = await Promise.all([
          fetch(`/api/clients/${clientId}`),
          fetch("/api/intake-templates"),
        ]);

        if (clientRes.ok) {
          const clientData = await clientRes.json();
          setClient(clientData);
          
          // Pre-fill existing notes
          if (clientData.intakeNotes) {
            try {
              const existingAnswers = JSON.parse(clientData.intakeNotes);
              setAnswers(existingAnswers);
            } catch {
              // If not JSON, put it all in the first question
              setAnswers({ "0": clientData.intakeNotes });
            }
          }
        }

        if (templatesRes.ok) {
          const templatesData = await templatesRes.json();
          setTemplates(templatesData);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [clientId]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Combine answers into formatted text
      const formattedNotes = currentQuestions
        .map((q, i) => `${q}\n${answers[i.toString()] || "לא צוין"}`)
        .join("\n\n");

      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeNotes: formattedNotes,
        }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בשמירה");
      }

      toast.success("התשאול נשמר בהצלחה");
      router.push(`/dashboard/clients/${clientId}`);
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

  if (!client) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">מטופל לא נמצא</p>
        <Button asChild>
          <Link href="/dashboard/clients">חזרה לרשימה</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/dashboard/clients/${clientId}`}>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">תשאול ראשוני - {client.name}</h1>
            <p className="text-muted-foreground">מלא את פרטי השיחה הראשונית</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
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

      {/* Template Selection */}
      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>בחר תבנית</CardTitle>
            <CardDescription>השתמש בתבנית מוכנה או התחל מאפס</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="תבנית ברירת מחדל" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">תבנית ברירת מחדל</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      <Card>
        <CardHeader>
          <CardTitle>שאלות תשאול</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentQuestions.map((question, index) => (
            <div key={index} className="space-y-2">
              <Label className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {index + 1}
                </span>
                {question}
              </Label>
              <Textarea
                value={answers[index.toString()] || ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [index.toString()]: e.target.value }))
                }
                placeholder="הזן תשובה..."
                rows={3}
                className="resize-none"
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}







