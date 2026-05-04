"use client";

import { useEffect, useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

interface InvitationInfo {
  organizationName: string;
  clinicRole: "THERAPIST" | "SECRETARY";
  intendedName: string | null;
  emailMasked: string;
  billingPaidByClinic: boolean;
  expiresAt: string;
  isExpired: boolean;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "REJECTED";
  otpRequired: boolean;
  viewerIsInvitee: boolean;
}

const ROLE_LABEL: Record<InvitationInfo["clinicRole"], string> = {
  THERAPIST: "מטפל/ת",
  SECRETARY: "מזכיר/ה",
};

export default function ClinicInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  // משתמש קיים = יש viewerIsInvitee true (מחובר ב-NextAuth לאותו email).
  const isExistingUser = info?.viewerIsInvitee ?? false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/p/clinic-invite/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            setLoadError(data.message || "ההזמנה לא נמצאה");
          }
          return;
        }
        const data: InvitationInfo = await res.json();
        if (!cancelled) {
          setInfo(data);
          if (data.intendedName) setName(data.intendedName);
        }
      } catch {
        if (!cancelled) setLoadError("שגיאת רשת. נסה/י שוב.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const expiryText = useMemo(() => {
    if (!info?.expiresAt) return "";
    return new Date(info.expiresAt).toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [info?.expiresAt]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg("הסיסמה חייבת להיות לפחות 8 תווים");
      return;
    }
    if (info.otpRequired && !/^\d{6}$/.test(otp)) {
      setErrorMsg("יש להזין קוד אימות בן 6 ספרות");
      return;
    }
    if (!isExistingUser && !name.trim()) {
      setErrorMsg("יש להזין שם מלא");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = { password };
      if (info.otpRequired) body.otp = otp;
      if (!isExistingUser) {
        body.name = name.trim();
        if (phone.trim()) body.phone = phone.trim();
      }

      const res = await fetch(`/api/p/clinic-invite/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 && data.requiresLogin) {
          // משתמש קיים שלא מחובר — מפנים ללוגין וחוזרים לדף ההזמנה.
          toast.info("יש להתחבר תחילה ולחזור לקישור ההזמנה");
          await signIn(undefined, {
            callbackUrl: `/invite/${encodeURIComponent(token)}`,
          });
          return;
        }
        setErrorMsg(data.message || "שגיאה באישור ההזמנה");
        return;
      }

      toast.success("הצטרפת לקליניקה בהצלחה!");

      // משתמש חדש — מפנים ל-login כדי שיתחבר עם הסיסמה שיצר. לא מבצעים
      // signIn אוטומטי כי ה-email המלא לא חשוף ב-client (רק masked).
      if (data.isNewUser) {
        router.push("/login?invite=accepted");
        return;
      }
      router.push(data.redirectTo ?? "/dashboard");
    } catch {
      setErrorMsg("שגיאת רשת. נסה/י שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  async function performReject() {
    setConfirmReject(false);
    try {
      const res = await fetch(`/api/p/clinic-invite/${encodeURIComponent(token)}/reject`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "שגיאה בדחיית ההזמנה");
        return;
      }
      toast.success("ההזמנה נדחתה");
      router.push("/");
    } catch {
      toast.error("שגיאת רשת");
    }
  }

  // ─── Render ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background p-6"
        dir="rtl"
      >
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="mx-auto p-3 bg-destructive/10 rounded-full w-fit">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-center">ההזמנה לא נגישה</CardTitle>
            <CardDescription className="text-center">
              {loadError ?? "ההזמנה לא נמצאה. ייתכן שהקישור פג תוקף או בוטל."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="w-full"
            >
              למסך הבית
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const blockedStatus =
    info.status === "ACCEPTED" ||
    info.status === "REVOKED" ||
    info.status === "REJECTED" ||
    info.status === "EXPIRED" ||
    info.isExpired;

  if (blockedStatus) {
    const messages: Record<string, string> = {
      ACCEPTED: "ההזמנה כבר אושרה. ניתן להתחבר רגיל.",
      REVOKED: "ההזמנה בוטלה ע״י בעל/ת הקליניקה.",
      REJECTED: "ההזמנה נדחתה.",
      EXPIRED: "ההזמנה פגה תוקף. בקש/י הזמנה חדשה מבעל/ת הקליניקה.",
    };
    const msg = messages[info.status] ?? messages.EXPIRED;
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background p-6"
        dir="rtl"
      >
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="mx-auto p-3 bg-amber-500/10 rounded-full w-fit">
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
            <CardTitle className="text-center">ההזמנה אינה פעילה</CardTitle>
            <CardDescription className="text-center">{msg}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button
              variant="outline"
              onClick={() => router.push("/login")}
              className="w-full"
            >
              למסך התחברות
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-6"
      dir="rtl"
    >
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="mx-auto p-3 bg-primary/15 rounded-full w-fit">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-center text-xl">
            הוזמנת להצטרף לקליניקה {info.organizationName}
          </CardTitle>
          <CardDescription className="text-center">
            תפקיד: <strong>{ROLE_LABEL[info.clinicRole]}</strong>
            {" · "}חשבון מיועד: <span dir="ltr">{info.emailMasked}</span>
          </CardDescription>
          <p className="text-xs text-center text-muted-foreground mt-2">
            <Clock className="inline h-3 w-3 ml-1" />
            תוקף עד: {expiryText}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleAccept} className="space-y-4">
            {!isExistingUser && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="name">שם מלא</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">טלפון (לא חובה)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05X-XXXXXXX"
                    autoComplete="tel"
                    disabled={submitting}
                  />
                </div>
              </>
            )}

            {isExistingUser && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-3 text-sm">
                התחברת כ-{info.emailMasked}. אישור הסיסמה משלים את הצירוף.
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="password">
                {isExistingUser ? "הסיסמה הקיימת" : "סיסמה חדשה (לפחות 8 תווים)"}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={isExistingUser ? "current-password" : "new-password"}
                disabled={submitting}
              />
            </div>

            {info.otpRequired && (
              <div className="space-y-1">
                <Label htmlFor="otp">קוד אימות מ-SMS</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  placeholder="6 ספרות"
                  disabled={submitting}
                />
              </div>
            )}

            {info.billingPaidByClinic && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-md p-3 text-xs text-muted-foreground">
                <ShieldCheck className="inline h-4 w-4 ml-1 text-blue-500" />
                המנוי שלך ב-MyTipul יהיה משולם ע״י הקליניקה. אם תעזב/י את הקליניקה
                בעתיד, החיוב יחזור אליך.
              </div>
            )}

            {errorMsg && (
              <div className="text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                )}
                אישור הצטרפות
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmReject(true)}
                disabled={submitting}
              >
                דחיית ההזמנה
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmReject}
        onOpenChange={(o) => !o && setConfirmReject(false)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לדחות את ההזמנה?</AlertDialogTitle>
            <AlertDialogDescription>
              דחיית ההזמנה תעדכן את בעל/ת הקליניקה. לא תוכל/י להצטרף עם הקישור
              הזה לאחר מכן. אם זו טעות — פשוט סגור/י את החלון.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
            <AlertDialogAction
              onClick={performReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              דחיית ההזמנה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
