import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/app-logo";
import { SiteFooter } from "@/components/site-footer";
import {
  Calendar, Users, Bell, ClipboardList, CreditCard,
  FileCheck, Shield, Lock, Star, Zap,
} from "lucide-react";
import Link from "next/link";

// Auto-deploy enabled: 2026-01-20

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  const features = [
    {
      icon: Users,
      title: "ניהול מטופלים",
      description: "תיקים מקצועיים, היסטוריה טיפולית מלאה ומעקב התקדמות לכל מטופל",
    },
    {
      icon: Calendar,
      title: "יומן פגישות חכם",
      description: "לוח שנה אינטואיטיבי עם ניהול פגישות, תזמון אוטומטי ותצוגות מגוונות",
    },
    {
      icon: Bell,
      title: "תזכורות אוטומטיות",
      description: "תזכורות SMS ומייל למטופלים — לפגישות, חובות וחידוש מנוי, אוטומטית וללא מאמץ",
    },
    {
      icon: ClipboardList,
      title: "שאלונים ואבחונים",
      description: "מעל 20 שאלונים מקצועיים מוכנים לשימוש כולל PHQ-9, GAD-7, BDI-II ועוד",
    },
    {
      icon: CreditCard,
      title: "ניהול תשלומים",
      description: "מעקב חובות, תשלומים חלקיים, קבלות ודוחות הכנסה מפורטים",
    },
    {
      icon: FileCheck,
      title: "מסמכים וחתימות",
      description: "טפסי הסכמה דיגיטליים, חתימה אלקטרונית וניהול מסמכים מאובטח",
    },
  ];

  const securityItems = [
    { icon: Lock, title: "הצפנת מידע", desc: "הצפנת נתונים ברמת AES-256 לכל המידע הרגיש במערכת" },
    { icon: Shield, title: "הגנת סיסמאות", desc: "הסיסמאות מוצפנות ולעולם לא נשמרות בטקסט גלוי" },
    { icon: Zap, title: "גישה מאובטחת", desc: "כל הגישה למידע מאומתת ומורשית עם אבטחה מרובת שכבות" },
    { icon: Users, title: "הנתונים שלך בלבד", desc: "המידע שייך רק לך ולא נמכר, נחשף או נשמר אצל צד שלישי" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
      {/* Hero */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="landing-centered max-w-3xl mx-auto">
          <div className="landing-centered mb-6">
            <AppLogo className="mx-auto w-[280px] sm:w-[360px] md:w-[440px] h-auto" priority />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 landing-centered" style={{ color: 'oklch(0.3 0.08 180)' }}>
            MyTipul
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-4 leading-relaxed landing-centered">
            המערכת המתקדמת בישראל לניהול פרקטיקה טיפולית
          </p>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto landing-centered">
            נהלו מטופלים, פגישות, תשלומים ושאלונים במקום אחד -
            {" "}מערכת אחת חכמה{" "}
            שחוסכת לכם <strong className="text-foreground">שעות עבודה בכל חודש</strong>.
          </p>

          <div className="landing-centered mb-8">
            <span className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-5 py-2.5 text-sm font-medium">
              <Star className="h-4 w-4 fill-primary" />
              14 ימי ניסיון חינם · ללא פרטי אשראי · ללא התחייבות
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8 h-12 w-full sm:w-auto" asChild>
              <Link href="/register">התחל תקופת ניסיון חינם</Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12 w-full sm:w-auto" asChild>
              <Link href="/login">התחברות</Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-28">
          <h2 className="text-2xl md:text-3xl font-bold landing-centered mb-4">
            הכל מה שהפרקטיקה שלכם צריכה
          </h2>
          <p className="text-muted-foreground landing-centered mb-12 max-w-2xl mx-auto">
            מערכת שלמה שמנהלת את כל ההיבטים של הפרקטיקה הטיפולית -
            {" "}מניהול מטופלים ופגישות ועד תשלומים ודוחות
          </p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-all hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Security Section */}
        <div className="mt-28 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold landing-centered mb-4">
            אבטחה ופרטיות ברמה הגבוהה ביותר
          </h2>
          <p className="text-muted-foreground landing-centered mb-12 max-w-2xl mx-auto">
            מידע טיפולי הוא מהרגיש ביותר שקיים.
            {" "}לכן השקענו באבטחה מתקדמת כדי להגן על המידע שלכם ושל המטופלים שלכם.
          </p>
          <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
            {securityItems.map((item) => (
              <div key={item.title} className="landing-centered p-5 rounded-2xl bg-card border">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1.5 landing-centered">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed landing-centered">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-28 landing-centered max-w-2xl mx-auto pb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 landing-centered">
            מוכנים לנהל את הפרקטיקה בצורה חכמה יותר?
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed landing-centered">
            הצטרפו למטפלים שכבר חוסכים זמן ומנהלים הכל ממקום אחד.
            <br />
            התחילו עם 14 ימי ניסיון חינם - ללא פרטי אשראי, ללא התחייבות.
          </p>
          <Button size="lg" className="text-base px-8 h-12" asChild>
            <Link href="/register">התחל תקופת ניסיון חינם</Link>
          </Button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
