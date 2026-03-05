import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import {
  Calendar, Users, Brain, ClipboardList, CreditCard,
  FileCheck, Sparkles, Shield, Lock, Star, CheckCircle, Zap,
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
      icon: Brain,
      title: "AI עוזר טיפולי",
      description: "הכנה חכמה לפגישות, ניתוח אוטומטי ותובנות מבוססות בינה מלאכותית",
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

  const aiFeatures = [
    {
      title: "הכנה חכמה לפגישה",
      description: "כל בוקר תקבלו תקציר מותאם לפגישות היום - סיכום הפגישה הקודמת, נושאים מרכזיים, תובנות על דפוסים רגשיים והמלצות ממוקדות",
    },
    {
      title: "ניתוח פגישות אוטומטי",
      description: "ניתוח מעמיק של כל פגישה - זיהוי רגשות דומיננטיים, דפוסים חוזרים והמלצות מקצועיות למפגש הבא",
    },
    {
      title: "ניתוח שאלונים מקצועי",
      description: "פירוש אוטומטי של תוצאות שאלונים, השוואה לנורמה, זיהוי דפוסים ותמונה קלינית מקיפה",
    },
    {
      title: "דוחות התקדמות",
      description: "מעקב אוטומטי אחר התקדמות המטופל לאורך זמן - ניתוח מגמות, מדדי שיפור והמלצות לטיפול",
    },
  ];

  const approaches = [
    "בק - טיפול קוגניטיבי-התנהגותי (CBT)",
    "מאהלר - הפרדה-אינדיבידואציה",
    "ויניקוט - החזקה ואובייקט מעברי",
    "בולבי - תיאוריית ההתקשרות",
    "קליין - יחסי אובייקט",
    "קוהוט - פסיכולוגיית העצמי",
    "יאלום - טיפול אקזיסטנציאלי",
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
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center w-40 h-40 mb-8">
            <Image src="/logo.png" alt="MyTipul" width={160} height={160} className="rounded-3xl shadow-lg" />
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            MyTipul
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-4 leading-relaxed">
            המערכת המתקדמת בישראל לניהול פרקטיקה טיפולית
          </p>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
            נהלו מטופלים, פגישות, תשלומים ושאלונים במקום אחד -
            {" "}עם בינה מלאכותית מתקדמת שחוסכת לכם שעות עבודה בכל חודש.
          </p>

          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-5 py-2.5 text-sm font-medium mb-8">
            <Star className="h-4 w-4 fill-primary" />
            14 ימי ניסיון חינם · ללא פרטי אשראי · ללא התחייבות
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
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            הכל מה שהפרקטיקה שלכם צריכה
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
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

        {/* AI Feature Highlight */}
        <div className="mt-28 max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4" />
              בינה מלאכותית מתקדמת
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              AI שעובד בשבילכם - כך שתוכלו להתמקד בטיפול
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              טכנולוגיית AI מהמתקדמות בעולם שמנתחת, מסכמת וממליצה -
              {" "}חוסכת לכם 5-10 שעות עבודה בחודש ומגלה דפוסים שקשה לזהות בעין אנושית
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {aiFeatures.map((feature) => (
              <div key={feature.title} className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/10 border hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Therapeutic approaches */}
          <div className="mt-8 p-6 rounded-2xl bg-card border">
            <div className="flex items-start gap-3 mb-4">
              <Brain className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-1">גישות טיפוליות מותאמות</h3>
                <p className="text-sm text-muted-foreground">
                  ה-AI מתאים את הניתוח וההמלצות לגישה הטיפולית שבחרתם -
                  {" "}ניתוחים מדויקים ורלוונטיים לשפה המקצועית שלכם
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {approaches.map((approach) => (
                <span key={approach} className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  {approach}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="mt-28 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            אבטחה ופרטיות ברמה הגבוהה ביותר
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            מידע טיפולי הוא מהרגיש ביותר שקיים.
            {" "}לכן השקענו באבטחה מתקדמת כדי להגן על המידע שלכם ושל המטופלים שלכם.
          </p>
          <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
            {securityItems.map((item) => (
              <div key={item.title} className="text-center p-5 rounded-2xl bg-card border">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1.5">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-28 text-center max-w-2xl mx-auto pb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            מוכנים לנהל את הפרקטיקה בצורה חכמה יותר?
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            הצטרפו למטפלים שכבר חוסכים זמן ומנהלים הכל ממקום אחד.
            <br />
            התחילו עם 14 ימי ניסיון חינם - ללא פרטי אשראי, ללא התחייבות.
          </p>
          <Button size="lg" className="text-base px-8 h-12" asChild>
            <Link href="/register">התחל תקופת ניסיון חינם</Link>
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-8 py-8">
        <div className="container mx-auto px-4 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Image src="/logo.png" alt="MyTipul" width={48} height={48} className="rounded-xl opacity-80" />
          <p>© {new Date().getFullYear()} MyTipul - מערכת ניהול לפרקטיקה טיפולית</p>
        </div>
      </footer>
    </div>
  );
}
