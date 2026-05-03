"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Building2,
  UserCheck,
  AlertCircle,
  CheckCircle,
  Clock,
  Heart,
} from "lucide-react";
import { toast } from "sonner";

type ChoiceValue = "STAY_WITH_CLINIC" | "FOLLOW_THERAPIST";

interface State {
  clientFirstName: string;
  organizationName: string;
  therapistName: string;
  decisionDeadline: string;
  currentChoice: ChoiceValue | "UNDECIDED";
  decidedAt: string | null;
  isExpired: boolean;
  isClosed: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  });
}

export function ChoiceClient({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingChoice, setPendingChoice] = useState<ChoiceValue | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/p/departure-choice/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || "שגיאה");
        return;
      }
      const data = await res.json();
      setState(data);
    } catch {
      setError("שגיאת רשת. נא לנסות שוב.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  async function handleConfirm() {
    if (!pendingChoice) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/p/departure-choice/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice: pendingChoice }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("הבחירה נשמרה. תודה!");
      setPendingChoice(null);
      fetchState();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-medium">{error || "הקישור אינו תקין"}</p>
            <p className="text-sm text-muted-foreground">
              נא לפנות לקליניקה לקבלת קישור חדש.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alreadyDecided = state.decidedAt !== null;
  const isFinal = state.isExpired || state.isClosed;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-primary/10 rounded-full mb-2">
            <Heart className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">שלום {state.clientFirstName}</h1>
          <p className="text-muted-foreground">
            יש לקבל החלטה לגבי המשך הטיפול
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">מה קרה?</CardTitle>
            <CardDescription>
              <strong>{state.therapistName}</strong> מסיים/ת את עבודתו בקליניקה{" "}
              <strong>{state.organizationName}</strong>.
              <br />
              נדרשת החלטה: האם להישאר בקליניקה עם מטפל/ת אחר/ת, או לעבור עם המטפל/ת
              שלך לקליניקה החדשה.
            </CardDescription>
          </CardHeader>
        </Card>

        {alreadyDecided && !isFinal && (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="py-6 text-center space-y-2">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto" />
              <p className="font-medium">תודה — בחירתך נשמרה</p>
              <p className="text-sm text-muted-foreground">
                {state.currentChoice === "FOLLOW_THERAPIST"
                  ? `בחרת לעבור עם ${state.therapistName} לקליניקה חדשה.`
                  : `בחרת להישאר ב-${state.organizationName}.`}
              </p>
              <p className="text-xs text-muted-foreground">
                לשינוי הבחירה — נא לפנות ישירות לקליניקה.
              </p>
            </CardContent>
          </Card>
        )}

        {state.isClosed && (
          <Card className="border-muted">
            <CardContent className="py-6 text-center space-y-2">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="font-medium">תהליך הבחירה הסתיים</p>
              <p className="text-sm text-muted-foreground">
                {state.currentChoice === "UNDECIDED"
                  ? `התקבלה ברירת המחדל: להישאר ב-${state.organizationName}.`
                  : state.currentChoice === "FOLLOW_THERAPIST"
                    ? `נרשמה הבחירה: מעבר עם ${state.therapistName}.`
                    : `נרשמה הבחירה: להישאר ב-${state.organizationName}.`}
              </p>
            </CardContent>
          </Card>
        )}

        {state.isExpired && !state.isClosed && !alreadyDecided && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="py-6 text-center space-y-2">
              <Clock className="h-10 w-10 text-amber-400 mx-auto" />
              <p className="font-medium">המועד לבחירה הסתיים</p>
              <p className="text-sm text-muted-foreground">
                לא בוצעה בחירה במועד. ברירת המחדל: להישאר ב-{state.organizationName}.
              </p>
            </CardContent>
          </Card>
        )}

        {!alreadyDecided && !isFinal && (
          <>
            <Card className="border-amber-500/30">
              <CardContent className="p-4 flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">
                    מועד אחרון לבחירה: {formatDate(state.decisionDeadline)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    אם לא תבוצע בחירה במועד, ההמשך ב-{state.organizationName} (ברירת
                    מחדל בטוחה).
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              {/* אופציה 1: להישאר בקליניקה */}
              <Card className="border-2">
                <CardContent className="p-6 space-y-3 text-center">
                  <div className="inline-flex p-3 bg-blue-500/15 rounded-full">
                    <Building2 className="h-7 w-7 text-blue-400" />
                  </div>
                  <h3 className="font-bold">להישאר בקליניקה</h3>
                  <p className="text-sm text-muted-foreground">
                    ממשיכים ב-{state.organizationName} עם מטפל/ת אחר/ת. הקליניקה תיצור
                    קשר ותציע אופציות.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setPendingChoice("STAY_WITH_CLINIC")}
                  >
                    אני בוחר/ת להישאר
                  </Button>
                </CardContent>
              </Card>

              {/* אופציה 2: לעבור עם המטפלת */}
              <Card className="border-2">
                <CardContent className="p-6 space-y-3 text-center">
                  <div className="inline-flex p-3 bg-purple-500/15 rounded-full">
                    <UserCheck className="h-7 w-7 text-purple-400" />
                  </div>
                  <h3 className="font-bold">לעבור עם {state.therapistName}</h3>
                  <p className="text-sm text-muted-foreground">
                    ממשיכים את הטיפול עם {state.therapistName} בקליניקה החדשה. פגישות
                    עבר נשארות בקליניקה הנוכחית.
                  </p>
                  <Button
                    className="w-full"
                    onClick={() => setPendingChoice("FOLLOW_THERAPIST")}
                  >
                    אני בוחר/ת לעבור
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-muted/40 border-0">
              <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">חשוב לדעת:</p>
                <ul className="list-disc pr-5 space-y-1">
                  <li>הבחירה תיכנס לתוקף מיידית לאחר אישור.</li>
                  <li>פגישות עבר וקבלות נשארות תמיד בקליניקה הנוכחית.</li>
                  <li>הבחירה אישית — לא משפיעה על מטופלים אחרים.</li>
                  <li>לשאלות — נא לפנות לקליניקה ישירות.</li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <AlertDialog
        open={pendingChoice !== null}
        onOpenChange={(open) => !open && setPendingChoice(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור בחירה</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingChoice === "FOLLOW_THERAPIST" ? (
                <>
                  בחרת <strong>לעבור עם {state.therapistName}</strong> לקליניקה החדשה.
                  <br />
                  המטפל/ת תיצור איתך קשר עם פרטי הקליניקה החדשה.
                </>
              ) : (
                <>
                  בחרת <strong>להישאר ב-{state.organizationName}</strong>.
                  <br />
                  הקליניקה תיצור קשר ותציע מטפל/ת חלופי/ת.
                </>
              )}
              <br />
              <br />
              לשינוי לאחר מכן — יש לפנות ישירות לקליניקה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={submitting}>
              {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
