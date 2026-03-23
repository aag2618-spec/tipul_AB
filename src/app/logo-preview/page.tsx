import type { Metadata } from "next";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const metadata: Metadata = {
  title: "תצוגת לוגו | MyTipul",
  description: "בדיקה ויזואלית של הלוגו (שקיפות וסיידבר)",
  robots: { index: false, follow: false },
};

export default function LogoPreviewPage() {
  return (
    <div
      className="min-h-screen flex flex-col md:flex-row-reverse"
      style={{
        background:
          "repeating-conic-gradient(#e8e8e8 0% 25%, #f4f4f4 0% 50%) 50% / 24px 24px",
      }}
    >
      <aside
        className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-l border-border bg-muted/40 px-3 py-4"
        aria-label="דמו סיידבר"
      >
        <div className="border-b border-border pb-3 mb-2 flex justify-center">
          <AppLogo width={160} height={80} className="object-contain max-w-[160px] h-auto" priority />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          דמו: אזור הלוגו בדפי העבודה (<code className="text-[0.7rem] bg-muted px-1 rounded">AppLogo</code>)
        </p>
      </aside>
      <main className="flex-1 p-6 text-foreground">
        <div className="max-w-lg space-y-4 text-sm leading-relaxed">
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-4 shadow-sm space-y-3">
            <p className="font-medium">איך מגיעים לקובץ בתיקיית ההורדות?</p>
            <p className="text-muted-foreground text-sm">
              הקובץ <strong>לא</strong> מופיע שם מעצמו. צריך אחת משתי הדרכים למטה. שם הקובץ:{" "}
              <span className="font-mono text-xs bg-muted px-1 rounded">mytipul-logo-preview.html</span>
            </p>
            <div className="rounded-md bg-muted/50 border p-3 space-y-2">
              <p className="font-medium text-sm">דמו דף עבודה שלם (CBT) להורדה</p>
              <p className="text-muted-foreground text-sm">
                קובץ HTML אחד: סיידבר כמו בדשבורד + תוכן דמה לגישת בק (CBT). אותו לוגו כמו
                בפועל.
              </p>
              <p className="text-muted-foreground text-sm">
                טרמינל:{" "}
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">
                  npm run save-work-demo-cbt
                </span>
              </p>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href="/api/download/work-demo-cbt" download="mytipul-work-demo-cbt.html">
                  <Download className="h-4 w-4" aria-hidden />
                  הורד דמו CBT (דפדפן)
                </a>
              </Button>
            </div>
            <div className="rounded-md bg-background/80 border p-3 space-y-2">
              <p className="font-medium text-sm">דרך 1 — הכי פשוט (מומלץ, בלי דפדפן)</p>
              <p className="text-muted-foreground text-sm">
                בטרמינל, מתוך תיקיית הפרויקט, הרץ:{" "}
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">
                  npm run save-logo-preview
                </span>
              </p>
              <p className="text-muted-foreground text-sm">
                בסוף יודפס <strong>נתיב מלא</strong> לקובץ (תיקיית Downloads או &quot;הורדות&quot;). פתח את
                הנתיב ב-File Explorer.
              </p>
            </div>
            <div className="rounded-md bg-background/80 border p-3 space-y-2">
              <p className="font-medium text-sm">דרך 2 — דרך הדפדפן</p>
              <p className="text-muted-foreground text-sm">
                הפעל את האתר (למשל <span className="font-mono text-xs">npm run dev</span>), היכנס לעמוד
                זה, ואז לחץ על הכפתור. אם לא רואים קובץ — בכרום לחץ{" "}
                <span className="font-mono text-xs">Ctrl+J</span> (רשימת הורדות), או בדוק איפה הדפדפן
                שומר הורדות בהגדרות.
              </p>
              <Button asChild size="lg" className="w-full sm:w-auto gap-2">
                <a href="/api/download/logo-preview" download="mytipul-logo-preview.html">
                  <Download className="h-4 w-4" aria-hidden />
                  הורד דרך הדפדפן
                </a>
              </Button>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="font-medium mb-2">למה הרקע משבצות?</p>
            <p className="text-muted-foreground">
              כדי לראות בבירור שהלוגו עם רקע שקוף — בלי מלבן לבן סביב הסמל והטקסט.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="font-medium mb-2">נתיב קבוע</p>
            <p className="text-muted-foreground">
              עמוד זה זמין תמיד בכתובת <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/logo-preview</span>
              {" "}(קל לזכור ולשתף).
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="font-medium mb-2">מקור הלוגו במערכת</p>
            <p className="text-muted-foreground">
              הקובץ <span className="font-mono text-xs">public/logo.png</span> והגדרות ב־
              <span className="font-mono text-xs"> src/config/branding.ts</span>.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="font-medium mb-2">ללא הורדה (מקוד המקור)</p>
            <p className="text-muted-foreground">
              בתיקיית <span className="font-mono text-xs">public</span> קיים{" "}
              <span className="font-mono text-xs">dashboard-logo-preview.html</span> ליד{" "}
              <span className="font-mono text-xs">logo.png</span>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
