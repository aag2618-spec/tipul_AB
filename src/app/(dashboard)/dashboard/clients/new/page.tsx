"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, FileText, Users, Pencil } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { SendIntakeLinkButton } from "@/components/clients/send-intake-link-button";

interface Question {
  id: string;
  text: string;
  type: "TEXT" | "TEXTAREA" | "SELECT";
  options?: string[];
  required: boolean;
  order: number;
}

interface IntakeQuestionnaireTemplate {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  // Bug #3: שאלונים ישנים נשמרו בפורמט { questions: [...] }; חדשים שטוחים [...].
  questions: Question[] | { questions: Question[] };
}

// Phase 3: רשימת מטפלי הקליניקה ל-picker. שדות מינימליים — תואמים
// ל-GET /api/clinic/therapists. ה-id ייכלל ב-body של POST /api/clients
// ויעבור דרך resolveTherapistIdForClient בשרת.
// email יכול להיות null ב-Prisma (User.email הוא String?), name גם כן.
// ה-endpoint מסנן SECRETARY, אז נשארות רק 2 ה-roles הללו.
interface ClinicTherapistOption {
  id: string;
  name: string | null;
  email: string | null;
  clinicRole: "OWNER" | "THERAPIST";
}

// Bug #3: normalize שאלונים בכל דרך שהם הגיעו ממאגר הנתונים.
function getQuestionsArray(raw: IntakeQuestionnaireTemplate["questions"]): Question[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.questions)) return raw.questions;
  return [];
}

export default function NewClientPage() {
  return (
    <Suspense>
      <NewClientContent />
    </Suspense>
  );
}

function NewClientContent() {
  const searchParams = useSearchParams();
  const fromQuickId = searchParams.get("fromQuick");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(true);
  const [allQuestionnaires, setAllQuestionnaires] = useState<IntakeQuestionnaireTemplate[]>([]);
  const [defaultQuestionnaire, setDefaultQuestionnaire] = useState<IntakeQuestionnaireTemplate | null>(null);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<IntakeQuestionnaireTemplate | null>(null);
  const [skipQuestionnaire, setSkipQuestionnaire] = useState(false);

  // Phase 3: ה-picker מוצג רק ל-OWNER ו-SECRETARY בקליניקה
  // (לפי clinicRole). independent therapist ו-clinic THERAPIST לא רואים אותו
  // — הם תמיד יוצרים על שמם, וכך גם השרת מתנהג אם לא נשלח therapistId.
  const myPermissions = useMyPermissions();
  const canPickTherapist =
    myPermissions.clinicRole === "OWNER" || myPermissions.clinicRole === "SECRETARY";
  const [clinicTherapists, setClinicTherapists] = useState<ClinicTherapistOption[]>([]);
  const [loadingTherapists, setLoadingTherapists] = useState(false);

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
    healthFund: "",
    // Phase 3: מטפל אחראי. ריק כברירת מחדל — ל-OWNER/SECRETARY חובה לבחור
    // לפני submit; ל-non-picker זה נשלח ריק וה-resolver בשרת ייקח self.
    therapistId: "",
  });
  
  const [questionnaireResponses, setQuestionnaireResponses] = useState<Record<string, string>>({});
  // אחרי שמירה — מציעים לשלוח שאלון פנייה במקום לקפוץ ישר לתיק.
  const [createdClient, setCreatedClient] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchDefaultQuestionnaire();
    fetchTherapistDefault();
  }, []);

  // Phase 3: טעינת רשימת המטפלים רק ל-OWNER/SECRETARY. הגנה כפולה —
  // ה-API מחזיר 403 לתפקידים אחרים, אבל פה לא קוראים אותו בכלל.
  // toast.error על non-OK / catch — להבדיל בין רשימה ריקה אמיתית
  // (אין מטפלים פעילים) לבין שגיאת רשת/שרת.
  useEffect(() => {
    if (!canPickTherapist) return;
    let cancelled = false;
    setLoadingTherapists(true);
    fetch("/api/clinic/therapists", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setClinicTherapists([]);
          toast.error("שגיאה בטעינת רשימת המטפלים");
          return;
        }
        const data = (await res.json()) as ClinicTherapistOption[];
        if (cancelled) return;
        setClinicTherapists(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setClinicTherapists([]);
          toast.error("שגיאה בטעינת רשימת המטפלים");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTherapists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canPickTherapist]);

  const fetchTherapistDefault = async () => {
    try {
      const res = await fetch("/api/user/profile");
      if (res.ok) {
        const profile = await res.json();
        if (profile.defaultSessionPrice != null) {
          setFormData((prev) => ({
            ...prev,
            defaultSessionPrice: prev.defaultSessionPrice || String(Number(profile.defaultSessionPrice)),
          }));
        }
      }
    } catch {
      // נשאר ריק — ה-API ישתמש בברירת מחדל
    }
  };

  useEffect(() => {
    if (!fromQuickId) return;
    fetch(`/api/clients/${fromQuickId}?fields=basic`)
      .then((res) => (res.ok ? res.json() : null))
      .then((client) => {
        if (!client) return;
        const nameParts = (client.name || "").trim().split(" ");
        setFormData((prev) => ({
          ...prev,
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
          phone: client.phone || "",
          email: client.email || "",
          defaultSessionPrice: client.defaultSessionPrice
            ? String(Number(client.defaultSessionPrice))
            : prev.defaultSessionPrice,
        }));
      })
      .catch(() => {});
  }, [fromQuickId]);

  const fetchDefaultQuestionnaire = async () => {
    try {
      setLoadingQuestionnaire(true);
      const response = await fetch("/api/intake-questionnaires");
      if (response.ok) {
        const templates = await response.json();
        setAllQuestionnaires(templates);
        const defaultTemplate = templates.find((t: IntakeQuestionnaireTemplate) => t.isDefault);
        setDefaultQuestionnaire(defaultTemplate || templates[0] || null);
        setSelectedQuestionnaire(defaultTemplate || templates[0] || null);
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

    // Phase 3: ל-OWNER/SECRETARY חובה לבחור מטפל אחראי. ל-PUT (שדרוג פונה)
    // ה-API לא תומך עדיין ב-therapistId — מדלגים על הוולידציה כדי לא לחסום
    // את ה-flow הקיים. ייתכן שיתווסף בעתיד.
    if (canPickTherapist && !fromQuickId && !formData.therapistId) {
      toast.error("יש לבחור מטפל/ת אחראי/ת");
      return;
    }

    // Validate required questionnaire questions
    if (!skipQuestionnaire && defaultQuestionnaire) {
      // Bug #3: שאלונים ישנים נשמרו כ-{questions: [...]}; חדשים כ-[...]
      const requiredQuestions = getQuestionsArray(defaultQuestionnaire.questions).filter((q) => q.required);
      const missingRequired = requiredQuestions.find((q) => !questionnaireResponses[q.id]?.trim());
      
      if (missingRequired) {
        toast.error("יש שאלות חובה בשאלון שלא מולאו");
        return;
      }
    }

    setIsLoading(true);

    try {
      // Phase 3: ה-API מצפה ל-therapistId רק כשנשלח (resolver יקבע self אחרת).
      // לא שולחים כשהוא ריק כדי לא לדרוס את ההתנהגות ההיסטורית של מטפל
      // עצמאי / clinic THERAPIST.
      const { therapistId: pickedTherapistId, ...formDataWithoutTherapist } = formData;
      const clientBodyForCreate = {
        ...formDataWithoutTherapist,
        healthFund: formData.healthFund || null,
        ...(pickedTherapistId ? { therapistId: pickedTherapistId } : {}),
      };

      // 1. Create or upgrade client
      let client;
      if (fromQuickId) {
        // שדרוג פונה מזדמן — עדכון הפונה הקיים (כולל isQuickClient: false)
        // PUT /api/clients/[id] עוד לא תומך ב-therapistId reassignment.
        const clientResponse = await fetch(`/api/clients/${fromQuickId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formDataWithoutTherapist, healthFund: formData.healthFund || null, isQuickClient: false }),
        });
        if (!clientResponse.ok) {
          const data = await clientResponse.json();
          throw new Error(data.message || "אירעה שגיאה");
        }
        client = await clientResponse.json();
      } else {
        const clientResponse = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientBodyForCreate),
        });
        if (!clientResponse.ok) {
          const data = await clientResponse.json();
          throw new Error(data.message || "אירעה שגיאה");
        }
        client = await clientResponse.json();
      }

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

      toast.success(fromQuickId ? "הפונה שודרג למטופל קבוע" : "המטופל נוסף בהצלחה");
      // הרגע הטבעי לשלוח שאלון פנייה — מציגים פאנל הצעה (במקום קפיצה ישר לתיק).
      setCreatedClient({ id: client.id, name: client.name ?? "" });
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

  if (createdClient) {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>המטופל נוסף בהצלחה ✓</CardTitle>
            <CardDescription>
              רוצה לשלוח {createdClient.name ? `ל${createdClient.name}` : "למטופל"} שאלון פנייה למילוי לפני הפגישה?
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <SendIntakeLinkButton clientId={createdClient.id} />
            <Button asChild variant="outline">
              <Link href={`/dashboard/clients/${createdClient.id}`}>
                המשך לתיק המטופל
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {fromQuickId ? "שדרוג פונה למטופל קבוע" : "מטופל חדש"}
          </h1>
          <p className="text-muted-foreground">
            {fromQuickId ? "השלם פרטים כדי להפוך למטופל קבוע" : "הוסף מטופל חדש למערכת"}
          </p>
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
                  <div className="flex items-center gap-4">
                    <Button
                      variant="link"
                      size="sm"
                      asChild
                      className="h-auto p-0 gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <Link href="/dashboard/settings/questionnaires">
                        <Pencil className="h-3 w-3" />
                        ערוך שאלון
                      </Link>
                    </Button>
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
                  {getQuestionsArray(defaultQuestionnaire.questions).map((question, index) => (
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
              {/* Phase 3 — picker מטפל אחראי (רק לבעלים/מזכירה בקליניקה).
                  לא מוצג בשדרוג פונה כי PUT עוד לא תומך בהקצאה מחדש. */}
              {canPickTherapist && !fromQuickId && (
                <div className="space-y-2">
                  <Label htmlFor="therapistId" className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    מטפל/ת אחראי/ת <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.therapistId}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, therapistId: value }))
                    }
                    disabled={isLoading || loadingTherapists}
                  >
                    <SelectTrigger id="therapistId">
                      <SelectValue
                        placeholder={loadingTherapists ? "טוען..." : "בחר/י מטפל/ת..."}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {clinicTherapists.length === 0 && !loadingTherapists ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          לא נמצאו מטפלים פעילים בקליניקה
                        </div>
                      ) : (
                        clinicTherapists.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name || t.email}
                            {t.clinicRole === "OWNER" ? " (בעלים)" : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    placeholder="מחיר"
                    value={formData.defaultSessionPrice}
                    onChange={handleChange}
                    disabled={isLoading}
                    dir="ltr"
                    className="text-left"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="healthFund">קופת חולים</Label>
                  <Select
                    value={formData.healthFund}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, healthFund: value === "NONE" ? "" : value }))
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger id="healthFund">
                      <SelectValue placeholder="פרטי (ללא קופה)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">פרטי (ללא קופה)</SelectItem>
                      <SelectItem value="CLALIT">כללית</SelectItem>
                      <SelectItem value="MACCABI">מכבי</SelectItem>
                      <SelectItem value="MEUHEDET">מאוחדת</SelectItem>
                      <SelectItem value="LEUMIT">לאומית</SelectItem>
                    </SelectContent>
                  </Select>
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














