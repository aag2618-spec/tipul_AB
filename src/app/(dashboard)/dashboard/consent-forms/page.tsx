"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, CheckCircle, Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

interface ConsentForm {
  id: string;
  type: string;
  title: string;
  signedAt: string | null;
  createdAt: string;
  isTemplate: boolean;
  client: {
    id: string;
    name: string;
  } | null;
}

const CONSENT_TYPES = {
  TREATMENT_AGREEMENT: "הסכם טיפול",
  INFORMED_CONSENT: "הסכמה מדעת",
  CONFIDENTIALITY: "הסכם סודיות",
  RECORDING_CONSENT: "הסכמה להקלטה",
  TELEHEALTH_CONSENT: "הסכמה לטיפול מרחוק",
  PARENTAL_CONSENT: "הסכמת הורים",
  CUSTOM: "טופס מותאם",
};

export default function ConsentFormsPage() {
  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [templates, setTemplates] = useState<ConsentForm[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    try {
      const [formsRes, templatesRes] = await Promise.all([
        fetch("/api/consent-forms?isTemplate=false"),
        fetch("/api/consent-forms?isTemplate=true"),
      ]);

      if (formsRes.ok && templatesRes.ok) {
        const formsData = await formsRes.json();
        const templatesData = await templatesRes.json();
        setForms(formsData);
        setTemplates(templatesData);
      }
    } catch (error) {
      console.error("Failed to fetch forms:", error);
      toast.error("שגיאה בטעינת הטפסים");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק טופס זה?")) return;

    try {
      const response = await fetch(`/api/consent-forms/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("הטופס נמחק בהצלחה");
        fetchForms();
      } else {
        throw new Error("Failed to delete form");
      }
    } catch (error) {
      console.error("Failed to delete form:", error);
      toast.error("שגיאה במחיקת הטופס");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">טפסי הסכמה</h1>
          <p className="text-muted-foreground">
            נהל הסכמות וטפסים למטופלים
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/consent-forms/new">
            <Plus className="ml-2 h-4 w-4" />
            טופס חדש
          </Link>
        </Button>
      </div>

      {/* Templates Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            תבניות טפסים
          </CardTitle>
          <CardDescription>
            תבניות לשימוש חוזר עם מטופלים חדשים
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{template.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {CONSENT_TYPES[template.type as keyof typeof CONSENT_TYPES]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <Link href={`/dashboard/consent-forms/${template.id}`}>
                        צפה
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>אין תבניות עדיין</p>
              <p className="text-sm">צור תבניות לשימוש חוזר</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Forms Section */}
      <Card>
        <CardHeader>
          <CardTitle>טפסים פעילים</CardTitle>
          <CardDescription>
            טפסים ששלחת למטופלים
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forms.length > 0 ? (
            <div className="space-y-3">
              {forms.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {form.signedAt ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-amber-600" />
                    )}
                    <div>
                      <p className="font-medium">{form.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{form.client?.name || "ללא מטופל"}</span>
                        <span>•</span>
                        <span>
                          {CONSENT_TYPES[form.type as keyof typeof CONSENT_TYPES]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {form.signedAt ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        נחתם {format(new Date(form.signedAt), "dd/MM/yyyy")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        ממתין לחתימה
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <Link href={`/dashboard/consent-forms/${form.id}`}>
                        {form.signedAt ? "צפה" : "חתום"}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(form.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>אין טפסים פעילים</p>
              <p className="text-sm">צור טופס חדש למטופל</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
