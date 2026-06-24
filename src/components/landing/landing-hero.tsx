import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/app-logo";

// סקציית ה-hero — לוגו, כותרת, tagline, badge ניסיון ו-2 כפתורי CTA.
// מעל הקפל → מופיע מיד (animate-fade-in), לא דרך Reveal.
export function LandingHero() {
  return (
    <section id="hero" className="relative overflow-hidden">
      {/* עיגולי טשטוש לרקע — עומק בלי תמונה */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -start-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -end-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="container mx-auto px-4 pt-28 pb-16 md:pt-36 md:pb-24 text-center">
        <div className="max-w-3xl mx-auto animate-fade-in">
          <AppLogo className="mx-auto w-[220px] sm:w-[300px] md:w-[360px] h-auto" priority />

          <h1
            className="mt-6 text-4xl md:text-6xl font-bold tracking-tight"
            style={{ color: "oklch(0.3 0.08 180)" }}
          >
            MyTipul
          </h1>

          <p className="mt-4 text-xl md:text-2xl text-muted-foreground leading-relaxed">
            המערכת המתקדמת בישראל לניהול פרקטיקה טיפולית
          </p>
          <p className="mt-3 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            נהלו מטופלים, פגישות, תשלומים, שאלונים ודפי עבודה — מערכת אחת חכמה
            שחוסכת לכם <strong className="text-foreground">שעות עבודה בכל חודש</strong>.
          </p>

          <div className="mt-7 flex justify-center">
            <span className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-5 py-2.5 text-sm font-medium">
              <Star className="h-4 w-4 fill-primary" />
              14 ימי ניסיון חינם · ללא כרטיס אשראי · ללא התחייבות
            </span>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8 h-12 w-full sm:w-auto" asChild>
              <Link href="/register">התחל תקופת ניסיון חינם</Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12 w-full sm:w-auto" asChild>
              <Link href="#worksheets">לגלות את דפי העבודה</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
