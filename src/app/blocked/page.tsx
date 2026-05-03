"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppLogo } from "@/components/app-logo";
import { ShieldAlert, Loader2 } from "lucide-react";

interface BlockInfo {
  isBlocked: boolean;
  blockReason: string | null;
}

// טקסט מותאם לסיבת החסימה. גם כותרת וגם תיאור — מאפשר למטפל
// להבין מיד אם זה חוב (פתיר בתשלום) או הפרת ToS/MANUAL (דורש פנייה).
const REASON_CONTENT: Record<
  string,
  { title: string; description: string; showBilling: boolean }
> = {
  DEBT: {
    title: "חשבונך מושבת — נדרש תשלום",
    description:
      "המנוי שלך לא פעיל. ברגע שהתשלום יתקבל — החשבון ישוחרר אוטומטית.",
    showBilling: true,
  },
  TOS_VIOLATION: {
    title: "חשבונך הושבת בעקבות הפרת תנאי שימוש",
    description:
      "החשבון הושבת בעקבות חשד להפרת תנאי השימוש של המערכת. נא לפנות לתמיכה לבירור.",
    showBilling: false,
  },
  MANUAL: {
    title: "חשבונך הושבת על ידי מנהל המערכת",
    description:
      "החשבון הושבת על ידי מנהל המערכת. לבירור פרטים, נא לפנות לתמיכה במייל למטה.",
    showBilling: false,
  },
};

const FALLBACK_CONTENT = {
  title: "החשבון מושבת",
  description: "הגישה לחשבון שלך הושבתה זמנית. אם נדמה לך שזו טעות — נא ליצור קשר עם התמיכה.",
  showBilling: true,
};

export default function BlockedPage() {
  const [info, setInfo] = useState<BlockInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/block-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setInfo(data))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, []);

  const content =
    info?.blockReason && REASON_CONTENT[info.blockReason]
      ? REASON_CONTENT[info.blockReason]
      : FALLBACK_CONTENT;

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4"
    >
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex justify-center">
            <AppLogo width={344} height={192} className="h-14 w-auto object-contain" priority />
          </div>
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">
              {loading ? "החשבון מושבת" : content.title}
            </CardTitle>
            <CardDescription className="mt-2">
              {loading ? "טוען מידע..." : content.description}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground space-y-2">
              {info?.blockReason === "DEBT" ? (
                <p>
                  ברגע שתשלום המנוי יתקבל אצלנו, החשבון ישוחרר אוטומטית. ניתן
                  לעדכן פרטי תשלום בדף "התשלומים והמנוי" למטה.
                </p>
              ) : info?.blockReason === "TOS_VIOLATION" || info?.blockReason === "MANUAL" ? (
                <p>
                  שחרור החשבון דורש החלטה ידנית של מנהל. תשלום לא ישחרר את
                  החסימה. אנא פנה לתמיכה במייל למטה.
                </p>
              ) : (
                <>
                  <p>ייתכן שהחשבון הושבת באחת מהסיבות הבאות:</p>
                  <ul className="list-disc list-inside space-y-1 pr-4">
                    <li>חוב פתוח על המנוי</li>
                    <li>הפרת תנאי השימוש</li>
                    <li>השבתה זמנית על ידי המנהל</li>
                  </ul>
                  <p className="pt-2">
                    אם נדמה לך שזו טעות — נא ליצור קשר עם התמיכה.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {content.showBilling && (
            <Button asChild className="w-full">
              <Link href="/dashboard/settings/billing">
                לדף התשלומים והמנוי
              </Link>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            התנתקות
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-2">
            תמיכה: support@mytipul.app
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
