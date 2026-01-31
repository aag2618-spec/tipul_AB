"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save, X } from "lucide-react";
import { toast } from "sonner";

interface Question {
  id: string;
  text: string;
  type: "TEXT" | "TEXTAREA" | "SELECT";
  options?: string[];
  required: boolean;
  order: number;
}

export default function NewQuestionnairePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: crypto.randomUUID(),
      text: "מה הביא אותך לפנות לטיפול עכשיו?",
      type: "TEXTAREA",
      required: false,
      order: 1,
    },
    {
      id: crypto.randomUUID(),
      text: "תאר/י את הבעיה המרכזית שאת/ה חווה",
      type: "TEXTAREA",
      required: false,
      order: 2,
    },
    {
      id: crypto.randomUUID(),
      text: "מתי הבעיה התחילה?",
      type: "TEXT",
      required: false,
      order: 3,
    },
    {
      id: crypto.randomUUID(),
      text: "האם קיבלת טיפול בעבר? אם כן, איזה סוג?",
      type: "TEXTAREA",
      required: false,
      order: 4,
    },
  ]);

  const addQuestion = () => {
    const newQuestion: Question = {
      id: crypto.randomUUID(),
      text: "",
      type: "TEXTAREA",
      required: false,
      order: questions.length + 1,
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const newQuestions = [...questions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newQuestions.length) return;

    [newQuestions[index], newQuestions[targetIndex]] = [
      newQuestions[targetIndex],
      newQuestions[index],
    ];

    // Update order numbers
    newQuestions.forEach((q, i) => {
      q.order = i + 1;
    });

    setQuestions(newQuestions);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("יש להזין שם לשאלון");
      return;
    }

    if (questions.length === 0) {
      toast.error("יש להוסיף לפחות שאלה אחת");
      return;
    }

    // Validate all questions have text
    const emptyQuestions = questions.filter((q) => !q.text.trim());
    if (emptyQuestions.length > 0) {
      toast.error("יש שאלות ללא טקסט");
      return;
    }

    // Validate SELECT questions have options
    const selectQuestionsWithoutOptions = questions.filter(
      (q) => q.type === "SELECT" && (!q.options || q.options.length === 0)
    );
    if (selectQuestionsWithoutOptions.length > 0) {
      toast.error("שאלות מסוג 'רשימה' חייבות להכיל אופציות");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/intake-questionnaires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          isDefault,
          questions: { questions },
        }),
      });

      if (response.ok) {
        toast.success("השאלון נשמר בהצלחה");
        router.push("/dashboard/settings/questionnaires");
      } else {
        toast.error("שגיאה בשמירת השאלון");
      }
    } catch (error) {
      console.error("Error saving questionnaire:", error);
      toast.error("שגיאה בשמירת השאלון");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">שאלון חדש</h1>
          <p className="text-muted-foreground mt-1">
            צור שאלון מותאם לפגישות ראשונות
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <X className="h-4 w-4 ml-2" />
          ביטול
        </Button>
      </div>

      {/* פרטי שאלון */}
      <Card>
        <CardHeader>
          <CardTitle>פרטי שאלון</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">שם השאלון *</Label>
            <Input
              id="name"
              placeholder='למשל: "תשאול ראשוני", "שאלון אבחון"'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">תיאור (אופציונלי)</Label>
            <Textarea
              id="description"
              placeholder="תיאור קצר של מטרת השאלון..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isDefault"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked as boolean)}
            />
            <Label htmlFor="isDefault" className="cursor-pointer">
              הגדר כברירת מחדל (יופיע אוטומטית בפתיחת תיק חדש)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* שאלות */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>שאלות ({questions.length})</CardTitle>
            <Button onClick={addQuestion} size="sm">
              <Plus className="h-4 w-4 ml-2" />
              הוסף שאלה
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {questions.map((question, index) => (
            <div key={question.id} className="border rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    שאלה {index + 1}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveQuestion(index, "up")}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveQuestion(index, "down")}
                    disabled={index === questions.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQuestion(question.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>טקסט השאלה *</Label>
                <Textarea
                  placeholder="הכנס את נוסח השאלה..."
                  value={question.text}
                  onChange={(e) =>
                    updateQuestion(question.id, { text: e.target.value })
                  }
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>סוג שאלה</Label>
                  <Select
                    value={question.type}
                    onValueChange={(value: any) =>
                      updateQuestion(question.id, { type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">טקסט קצר (שורה אחת)</SelectItem>
                      <SelectItem value="TEXTAREA">טקסט חופשי (מספר שורות)</SelectItem>
                      <SelectItem value="SELECT">רשימה (רב-בררה)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`required-${question.id}`}
                      checked={question.required}
                      onCheckedChange={(checked) =>
                        updateQuestion(question.id, { required: checked as boolean })
                      }
                    />
                    <Label htmlFor={`required-${question.id}`} className="cursor-pointer">
                      שאלה חובה
                    </Label>
                  </div>
                </div>
              </div>

              {question.type === "SELECT" && (
                <div className="space-y-2">
                  <Label>אופציות (שורה אחת לכל אופציה) *</Label>
                  <Textarea
                    placeholder="רווק&#10;נשוי&#10;גרוש&#10;אלמן"
                    value={question.options?.join("\n") || ""}
                    onChange={(e) => {
                      const options = e.target.value
                        .split("\n")
                        .filter((opt) => opt.trim());
                      updateQuestion(question.id, { options });
                    }}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    {question.options?.length || 0} אופציות
                  </p>
                </div>
              )}
            </div>
          ))}

          {questions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p>לא הוספת עדיין שאלות</p>
              <Button onClick={addQuestion} className="mt-4">
                <Plus className="h-4 w-4 ml-2" />
                הוסף שאלה ראשונה
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* כפתורי שמירה */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin ml-2" />
              שומר...
            </>
          ) : (
            <>
              <Save className="h-5 w-5 ml-2" />
              שמור שאלון
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

