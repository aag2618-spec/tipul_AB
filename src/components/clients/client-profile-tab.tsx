import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Mail, Send, Plus, Stethoscope, ClipboardList, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { QuestionnaireAnalysis } from "@/components/ai/questionnaire-analysis";
import { format } from "date-fns";

interface QuestionnaireResponse {
  id: string;
  status: string;
  totalScore: number | null;
  completedAt: Date | null;
  template: { name: string };
}

interface IntakeResponse {
  id: string;
  filledAt: Date;
  template: { name: string };
}

interface ClientProfileTabProps {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  address: string | null;
  notes: string | null;
  initialDiagnosis: string | null;
  intakeNotes: string | null;
  questionnaireResponses: QuestionnaireResponse[];
  intakeResponses: IntakeResponse[];
  intakeResponsesCount: number;
  questionnaireResponsesCount: number;
  userAiTier: string;
}

export function ClientProfileTab({
  clientId,
  clientName,
  clientEmail,
  address,
  notes,
  initialDiagnosis,
  intakeNotes,
  questionnaireResponses,
  intakeResponses,
  intakeResponsesCount,
  questionnaireResponsesCount,
  userAiTier,
}: ClientProfileTabProps) {
  return (
    <Tabs defaultValue="details" className="w-full">
      <TabsList>
        <TabsTrigger value="details">פרטים אישיים</TabsTrigger>
        <TabsTrigger value="questionnaires">שאלונים ואבחון</TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>פרטים נוספים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {address && (
                <div>
                  <p className="text-sm text-muted-foreground">כתובת</p>
                  <p className="font-medium">{address}</p>
                </div>
              )}
              {notes && (
                <div>
                  <p className="text-sm text-muted-foreground">הערות</p>
                  <p className="font-medium whitespace-pre-wrap">{notes}</p>
                </div>
              )}
              {!address && !notes && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>אין פרטים נוספים</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href={`/dashboard/clients/${clientId}/edit`}>
                      הוסף פרטים
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>שלח מייל למטופל</CardTitle>
              <CardDescription>
                {clientEmail ? `ישלח ל-${clientEmail}` : "למטופל אין כתובת מייל"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {clientEmail ? (
                <Button asChild className="w-full">
                  <Link href={`/dashboard/clients/${clientId}/email`}>
                    <Send className="ml-2 h-4 w-4" />
                    שלח מייל
                  </Link>
                </Button>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <Mail className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">הוסף כתובת מייל כדי לשלוח הודעות</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href={`/dashboard/clients/${clientId}/edit`}>
                      ערוך פרטים
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="questionnaires" className="mt-4">
        <div className="space-y-6">
          {/* תשאול ראשוני */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>תשאול ראשוני</CardTitle>
                  <CardDescription>
                    {intakeResponsesCount} שאלונים ממולאים
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {intakeResponses && intakeResponses.length > 0 ? (
                <div className="space-y-3">
                  {intakeResponses.map((response: any) => (
                    <div
                      key={response.id}
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{response.template.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(response.filledAt), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/intake-responses/${response.id}`}>
                            צפה
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>לא מולא תשאול ראשוני</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* שאלונים פסיכולוגיים */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>שאלונים פסיכולוגיים</CardTitle>
                  <CardDescription>
                    {questionnaireResponsesCount} שאלונים ממולאים
                  </CardDescription>
                </div>
                <Button asChild>
                  <Link href={`/dashboard/questionnaires/new?client=${clientId}`}>
                    <Plus className="ml-2 h-4 w-4" />
                    שאלון חדש
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {questionnaireResponses.length > 0 ? (
                <div className="space-y-3">
                  {questionnaireResponses.map((response) => (
                    <Link
                      key={response.id}
                      href={`/dashboard/questionnaires/${response.id}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <ClipboardList className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{response.template.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {response.completedAt
                                ? format(new Date(response.completedAt), "dd/MM/yyyy HH:mm")
                                : "בתהליך"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              response.status === "COMPLETED"
                                ? "default"
                                : response.status === "ANALYZED"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {response.status === "COMPLETED"
                              ? "הושלם"
                              : response.status === "ANALYZED"
                              ? "נותח"
                              : "בתהליך"}
                          </Badge>
                          {response.totalScore !== null && (
                            <Badge variant="outline">
                              ציון: {response.totalScore}
                            </Badge>
                          )}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="mx-auto h-16 w-16 mb-4 opacity-50" />
                  <p className="text-lg mb-2">אין שאלונים ממולאים</p>
                  <p className="text-sm mb-4">
                    שאלונים מסייעים באבחון ומעקב אחר התקדמות הטיפול
                  </p>
                  <Button asChild>
                    <Link href={`/dashboard/questionnaires/new?client=${clientId}`}>
                      <Plus className="ml-2 h-4 w-4" />
                      מלא שאלון ראשון
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ניתוח AI לשאלונים */}
          {questionnaireResponses && questionnaireResponses.length > 0 && (
            <QuestionnaireAnalysis
              clientId={clientId}
              clientName={clientName}
              questionnaires={questionnaireResponses}
              userTier={(userAiTier as "ESSENTIAL" | "PRO" | "ENTERPRISE") || "ESSENTIAL"}
              compact
            />
          )}

          {/* אבחון והערות */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>אבחון ראשוני</CardTitle>
                <CardDescription>האבחון שלך לגבי המטופל</CardDescription>
              </CardHeader>
              <CardContent>
                {initialDiagnosis ? (
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {initialDiagnosis}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Stethoscope className="mx-auto h-12 w-12 mb-3 opacity-50" />
                    <p>לא הוזן אבחון ראשוני</p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href={`/dashboard/clients/${clientId}/edit`}>
                        הוסף אבחון
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>הערות תשאול ראשוני</CardTitle>
                <CardDescription>מהשיחה הראשונית עם המטופל</CardDescription>
              </CardHeader>
              <CardContent>
                {intakeNotes ? (
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {intakeNotes}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="mx-auto h-12 w-12 mb-3 opacity-50" />
                    <p>אין הערות תשאול</p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href={`/dashboard/intake/${clientId}`}>
                        מלא תשאול ראשוני
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
