"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Copy, Trash2, Edit, Star } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface QuestionnaireTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  questions: any;
  createdAt: string;
  _count: {
    responses: number;
  };
}

export default function QuestionnairesPage() {
  const [templates, setTemplates] = useState<QuestionnaireTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/intake-questionnaires");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      } else {
        toast.error("שגיאה בטעינת שאלונים");
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("שגיאה בטעינת שאלונים");
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const response = await fetch(`/api/intake-questionnaires/${id}/duplicate`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("השאלון שוכפל בהצלחה");
        fetchTemplates();
      } else {
        toast.error("שגיאה בשכפול השאלון");
      }
    } catch (error) {
      console.error("Error duplicating template:", error);
      toast.error("שגיאה בשכפול השאלון");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const template = templates.find((t) => t.id === id);
      if (!template) return;

      const response = await fetch(`/api/intake-questionnaires/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...template,
          isDefault: true,
        }),
      });

      if (response.ok) {
        toast.success("השאלון הוגדר כברירת מחדל");
        fetchTemplates();
      } else {
        toast.error("שגיאה בעדכון השאלון");
      }
    } catch (error) {
      console.error("Error setting default:", error);
      toast.error("שגיאה בעדכון השאלון");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את "${name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/intake-questionnaires/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("השאלון נמחק בהצלחה");
        fetchTemplates();
      } else {
        toast.error("שגיאה במחיקת השאלון");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("שגיאה במחיקת השאלון");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">שאלונים</h1>
          <p className="text-muted-foreground mt-1">
            נהל שאלונים לפגישות ראשונות ואבחון
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/settings/questionnaires/new">
            <Plus className="h-4 w-4 ml-2" />
            צור שאלון חדש
          </Link>
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-muted p-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">אין שאלונים</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  צור את השאלון הראשון שלך כדי להתחיל לאסוף מידע מהמטופלים בפגישות הראשונות
                </p>
              </div>
              <Button asChild>
                <Link href="/dashboard/settings/questionnaires/new">
                  <Plus className="h-4 w-4 ml-2" />
                  צור שאלון חדש
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => {
            // תמיכה בשני פורמטים: ישן { questions: [...] } וחדש [...] (אחרי תיקון Bug #3)
            const rawQ = template.questions;
            const questionsArr = Array.isArray(rawQ) ? rawQ : (rawQ?.questions ?? []);
            const questionCount = questionsArr.length;
            
            return (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl">{template.name}</CardTitle>
                        {template.isDefault && (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3" />
                            ברירת מחדל
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <CardDescription className="mt-1">
                          {template.description}
                        </CardDescription>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>📋 {questionCount} שאלות</span>
                        <span>✅ {template._count.responses} תשובות</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link href={`/dashboard/settings/questionnaires/${template.id}`}>
                          <Edit className="h-4 w-4 ml-1" />
                          ערוך
                        </Link>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicate(template.id)}
                      >
                        <Copy className="h-4 w-4 ml-1" />
                        שכפל
                      </Button>

                      {!template.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(template.id)}
                        >
                          <Star className="h-4 w-4 ml-1" />
                          הגדר ברירת מחדל
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(template.id, template.name)}
                        disabled={template._count.responses > 0}
                        title={
                          template._count.responses > 0
                            ? "לא ניתן למחוק שאלון עם תשובות"
                            : "מחק שאלון"
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">💡 טיפים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>• <strong>ברירת מחדל:</strong> השאלון יופיע אוטומטית בפתיחת תיק חדש</p>
          <p>• <strong>שכפול:</strong> צור וריאציות של שאלון קיים בקליק אחד</p>
          <p>• <strong>ללא הגבלה:</strong> הוסף כמה שאלות שרוצה לכל שאלון</p>
        </CardContent>
      </Card>
    </div>
  );
}
