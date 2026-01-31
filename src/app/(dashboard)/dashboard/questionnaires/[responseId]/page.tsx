"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";

interface Question {
  id: string;
  text: string;
  type: string;
  options?: string[];
}

interface QuestionnaireResponse {
  id: string;
  filledAt: string;
  responses: Record<string, string>;
  template: {
    name: string;
    questions: {
      questions: Question[];
    };
  };
  client: {
    name: string;
    id: string;
  };
}

export default function ViewQuestionnaireResponsePage({
  params,
}: {
  params: Promise<{ responseId: string }>;
}) {
  const { responseId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState<QuestionnaireResponse | null>(null);

  useEffect(() => {
    fetchResponse();
  }, [responseId]);

  const fetchResponse = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/questionnaires/responses/${responseId}`);
      if (res.ok) {
        const data = await res.json();
        setResponse(data);
      } else {
        toast.error("שגיאה בטעינת השאלון");
        router.back();
      }
    } catch (error) {
      console.error("Error fetching response:", error);
      toast.error("שגיאה בטעינת השאלון");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!response) {
    return null;
  }

  const questions = response.template.questions.questions;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{response.template.name}</h1>
          <p className="text-muted-foreground">
            מטופל: {response.client.name} •{" "}
            {format(new Date(response.filledAt), "d בMMMM yyyy, HH:mm", { locale: he })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>תשובות</CardTitle>
            <Badge variant="outline">
              <Calendar className="h-3 w-3 ml-1" />
              {format(new Date(response.filledAt), "d/M/yyyy", { locale: he })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {questions.map((question, index) => {
            const answer = response.responses[question.id];

            return (
              <div key={question.id} className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">
                    {index + 1}.
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{question.text}</p>
                    <div className="mt-2 p-4 rounded-lg bg-muted/50">
                      {answer ? (
                        <p className="whitespace-pre-wrap">{answer}</p>
                      ) : (
                        <p className="text-muted-foreground italic">לא נענה</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          חזור
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/clients/${response.client.id}`}>
            עבור לתיק המטופל
          </Link>
        </Button>
      </div>
    </div>
  );
}
