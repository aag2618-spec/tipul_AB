"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, CheckCircle, XCircle, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function AdminQuestionnairesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string; data?: { created: number; updated: number; errors: number } } | null>(null);

  // בדיקת הרשאות - רק ADMIN או MANAGER
  useEffect(() => {
    if (status === "loading") return;
    
    if (!session) {
      router.push("/auth/signin");
      return;
    }

    const userRole = session.user.role;
    if (userRole !== "ADMIN" && userRole !== "MANAGER") {
      toast.error("אין לך הרשאה לגשת לדף זה");
      router.push("/dashboard");
    }
  }, [session, status, router]);

  const loadQuestionnaires = async () => {
    try {
      setLoading(true);
      setResult(null);
      
      const response = await fetch("/api/questionnaires/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, data });
        toast.success("השאלונים נטענו בהצלחה!");
      } else {
        setResult({ success: false, error: data.error });
        toast.error("שגיאה בטעינת שאלונים: " + data.error);
      }
    } catch (error: unknown) {
      console.error("Error loading questionnaires:", error);
      setResult({ success: false, error: error instanceof Error ? error.message : "שגיאה לא ידועה" });
      toast.error("שגיאה בטעינת שאלונים");
    } finally {
      setLoading(false);
    }
  };

  // טוען בזמן בדיקת הרשאות
  if (status === "loading") {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  // אין הרשאה
  const userRole = session?.user.role;
  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[400px]" dir="rtl">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">אין הרשאת גישה</h2>
              <p className="text-muted-foreground mb-4">
                דף זה מיועד למשתמשים עם הרשאות ניהול בלבד
              </p>
              <Button onClick={() => router.push("/dashboard")}>
                חזרה לדשבורד
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">ניהול שאלונים</h1>
        <p className="text-muted-foreground mb-8">
          טען שאלונים חדשים למסד הנתונים
        </p>

        <Card>
          <CardHeader>
            <CardTitle>טעינת שאלונים</CardTitle>
            <CardDescription>
              טען את כל טמפלייטים השאלונים המוגדרים בקוד למסד הנתונים.
              פעולה זו תוסיף שאלונים חדשים ותעדכן קיימים.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={loadQuestionnaires}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                  טוען שאלונים...
                </>
              ) : (
                <>
                  <Upload className="ml-2 h-5 w-5" />
                  טען שאלונים למסד הנתונים
                </>
              )}
            </Button>

            {result && (
              <div
                className={`p-4 rounded-lg border ${
                  result.success
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h3
                      className={`font-semibold mb-1 ${
                        result.success ? "text-green-900" : "text-red-900"
                      }`}
                    >
                      {result.success ? "הצלחה!" : "שגיאה"}
                    </h3>
                    {result.success && result.data && (
                      <div className="text-sm text-green-800 space-y-1">
                        <p>
                          נוספו:{" "}
                          <span className="font-bold">
                            {result.data.created}
                          </span>{" "}
                          שאלונים חדשים
                        </p>
                        <p>
                          עודכנו:{" "}
                          <span className="font-bold">
                            {result.data.updated}
                          </span>{" "}
                          שאלונים קיימים
                        </p>
                        <p className="text-xs text-green-600 mt-2">
                          השאלונים החדשים זמינים כעת למילוי וסיכום AI אוטומטי!
                        </p>
                      </div>
                    )}
                    {!result.success && (
                      <p className="text-sm text-red-800">
                        {result.error || "שגיאה לא ידועה"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 text-sm">
              <h4 className="font-semibold text-sky-900 mb-2">
                💡 מידע חשוב:
              </h4>
              <ul className="text-sky-800 space-y-1 mr-4 list-disc">
                <li>הפעולה בטוחה - לא תמחק שאלונים קיימים</li>
                <li>שאלונים חדשים יווספו אוטומטית</li>
                <li>שאלונים קיימים יעודכנו אם השתנו בקוד</li>
                <li>כל השאלונים החדשים יכללו סיכום AI אוטומטי</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>שאלונים חדשים במערכת</CardTitle>
            <CardDescription>
              15+ שאלונים קליניים שנוספו למערכת
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">🧒 ילדים ומתבגרים:</h4>
                <ul className="mr-4 space-y-1 text-muted-foreground">
                  <li>• CDI-2 - מדד דיכאון לילדים</li>
                  <li>• SCARED - סקר חרדות לילדים</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">👨‍👩‍👧 שאלונים להורים:</h4>
                <ul className="mr-4 space-y-1 text-muted-foreground">
                  <li>• SDQ-Parent - חוזקות וקשיים</li>
                  <li>• Vanderbilt - הערכת ADHD</li>
                  <li>• PSI-SF - מדד לחץ הורי</li>
                  <li>• ECBI - מלאי התנהגות ילדים</li>
                  <li>• Alabama APQ - שאלון הורות</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">🎭 הפרעות אישיות:</h4>
                <ul className="mr-4 space-y-1 text-muted-foreground">
                  <li>• MSI-BPD - סקר הפרעת אישיות גבולית</li>
                  <li>• PDQ-4+ - כל הפרעות האישיות</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">
                  👨‍👩‍👧‍👦 העברות בין-דוריות:
                </h4>
                <ul className="mr-4 space-y-1 text-muted-foreground">
                  <li>• CTQ - טראומת ילדות</li>
                  <li>• ECR-R - התקשרות במבוגרים</li>
                  <li>• PBI - קשר הורי</li>
                  <li>• ITQ - טראומה מורכבת (C-PTSD)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">🧠 נוספים:</h4>
                <ul className="mr-4 space-y-1 text-muted-foreground">
                  <li>• EAT-26 - הפרעות אכילה</li>
                  <li>• ISI - נדודי שינה</li>
                  <li>• BHS - חוסר תקווה</li>
                  <li>• RRS - הרהורים</li>
                  <li>• WEMWBS - רווחה נפשית</li>
                  <li>• WHODAS 2.0 - הערכת תפקוד</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
