"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Loader2, Save, FileText } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface Question {
  id: string;
  text: string;
  type: "TEXT" | "TEXTAREA" | "SELECT";
  options?: string[];
  required: boolean;
  order: number;
}

interface QuestionnaireTemplate {
  id: string;
  name: string;
  questions: {
    questions: Question[];
  };
}

export default function NewClientPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(true);
  const [defaultQuestionnaire, setDefaultQuestionnaire] = useState<QuestionnaireTemplate | null>(null);
  const [skipQuestionnaire, setSkipQuestionnaire] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    birthDate: "",
    address: "",
    notes: "",
    status: "ACTIVE",
    defaultSessionPrice: "",
  });
  
  const [questionnaireResponses, setQuestionnaireResponses] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchDefaultQuestionnaire();
  }, []);

  const fetchDefaultQuestionnaire = async () => {
    try {
      setLoadingQuestionnaire(true);
      const response = await fetch("/api/intake-questionnaires");
      if (response.ok) {
        const templates = await response.json();
        const defaultTemplate = templates.find((t: QuestionnaireTemplate) => t.isDefault);
        setDefaultQuestionnaire(defaultTemplate || null);
      }
    } catch (error) {
      console.error("Error fetching questionnaire:", error);
    } finally {
      setLoadingQuestionnaire(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleQuestionnaireChange = (questionId: string, value: string) => {
    setQuestionnaireResponses((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error("נא להזין שם פרטי ושם משפחה");
      return;
    }

    // Validate required questionnaire questions
    if (!skipQuestionnaire && defaultQuestionnaire) {
      const requiredQuestions = defaultQuestionnaire.questions.questions.filter(q => q.required);
      const missingRequired = requiredQuestions.find(q => !questionnaireResponses[q.id]?.trim());
      
      if (missingRequired) {
        toast.error("יש שאלות חובה בשאלון שלא מולאו");
        return;
      }
    }

    setIsLoading(true);

    try {
      // 1. Create client
      const clientResponse = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!clientResponse.ok) {
        const data = await clientResponse.json();
        throw new Error(data.message || "אירעה שגיאה");
      }

      const client = await clientResponse.json();

      // 2. Save questionnaire responses if not skipped
      if (!skipQuestionnaire && defaultQuestionnaire && Object.keys(questionnaireResponses).length > 0) {
        await fetch("/api/intake-questionnaires/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: client.id,
            templateId: defaultQuestionnaire.id,
            responses: questionnaireResponses,
          }),
        });
      }

      toast.success("המטופל נוסף בהצלחה");
      router.push(`/dashboard/clients/${client.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    } finally {
      setIsLoading(false);
    }
  };

  const renderQuestion = (question: Question) => {
    const value = questionnaireResponses[question.id] || "";

    switch (question.type) {
      case "TEXT":
        return (
          <Input
            value={value}
            onChange={(e) => handleQuestionnaireChange(question.id, e.target.value)}
            placeholder="הזן תשובה..."
            disabled={isLoading}
          />
        );
      
      case "TEXTAREA":
        return (
          <Textarea
            value={value}
            onChange={(e) => handleQuestionnaireChange(question.id, e.target.value)}
            placeholder="הזן תשובה..."
            rows={4}
            disabled={isLoading}
          />
        );
      
      case "SELECT":
        return (
          <Select
            value={value}
            onValueChange={(val) => handleQuestionnaireChange(question.id, val)}
            disabled={isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="בחר..." />
            </SelectTrigger>
            <SelectContent>
              {question.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/clients">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מטופל חדש</h1>
          <p className="text-muted-foreground">הוסף מטופל חדש למערכת</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid lg:grid-cols-2 gap-6">
          {/* LEFT: Questionnaire */}
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>
                    {defaultQuestionnaire?.name || "תשאול ראשוני"}
                  </CardTitle>
                </div>
                {defaultQuestionnaire && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="skipQuestionnaire"
                      checked={skipQuestionnaire}
                      onCheckedChange={(checked) => setSkipQuestionnaire(checked as boolean)}
                      disabled={isLoading}
                    />
                    <Label htmlFor="skipQuestionnaire" className="cursor-pointer text-sm">
                      דלג
                    </Label>
                  </div>
                )}
              </div>
              <CardDescription>
                {loadingQuestionnaire
                  ? "טוען שאלון..."
                  : defaultQuestionnaire
                  ? "מלא את פרטי השיחה הראשונה (אופציונלי)"
                  : "לא הוגדר שאלון ברירת מחדל"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingQuestionnaire ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !defaultQuestionnaire ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>לא הוגדר שאלון ברירת מחדל</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href="/dashboard/settings/questionnaires">
                      הגדר שאלון בהגדרות
                    </Link>
                  </Button>
                </div>
              ) : skipQuestionnaire ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>השאלון ידולג</p>
                  <p className="text-xs mt-1">ניתן למלא מאוחר יותר</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {defaultQuestionnaire.questions.questions.map((question, index) => (
                    <div key={question.id} className="space-y-2">
                      <Label className="text-base">
                        {index + 1}. {question.text}
                        {question.required && <span className="text-destructive"> *</span>}
                      </Label>
                      {renderQuestion(question)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: Client Details */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>פרטי מטופל</CardTitle>
              <CardDescription>מלא את הפרטים הבסיסיים של המטופל</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">שם פרטי *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="ישראל"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">שם משפחה *</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="ישראלי"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">טלפון</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="050-1234567"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={isLoading}
                    dir="ltr"
                    className="text-left"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">אימייל</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={isLoading}
                    dir="ltr"
                    className="text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birthDate">תאריך לידה</Label>
                  <Input
                    id="birthDate"
                    name="birthDate"
                    type="date"
                    value={formData.birthDate}
                    onChange={handleChange}
                    disabled={isLoading}
                    dir="ltr"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">כתובת</Label>
                  <Input
                    id="address"
                    name="address"
                    placeholder="עיר, רחוב"
                    value={formData.address}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">סטטוס</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="בחר סטטוס" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">התחיל טיפול</SelectItem>
                      <SelectItem value="WAITING">ממתין בתור</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultSessionPrice">מחיר פגישה ברירת מחדל (₪)</Label>
                  <Input
                    id="defaultSessionPrice"
                    name="defaultSessionPrice"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="300"
                    value={formData.defaultSessionPrice}
                    onChange={handleChange}
                    disabled={isLoading}
                    dir="ltr"
                    className="text-left"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">הערות</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="הערות נוספות על המטופל..."
                  value={formData.notes}
                  onChange={handleChange}
                  disabled={isLoading}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild disabled={isLoading}>
            <Link href="/dashboard/clients">ביטול</Link>
          </Button>
          <Button type="submit" disabled={isLoading} size="lg">
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="ml-2 h-5 w-5" />
                שמור מטופל + שאלון
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}














