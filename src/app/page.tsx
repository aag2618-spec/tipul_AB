import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Leaf, Calendar, Users, Mic, FileText, BarChart3 } from "lucide-react";
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
      description: "ניהול תיקי מטופלים, היסטוריה ומעקב",
    },
    {
      icon: Calendar,
      title: "יומן פגישות",
      description: "ניהול פגישות, זמנים וסוגי טיפול",
    },
    {
      icon: Mic,
      title: "הקלטה ותמלול",
      description: "הקלטת שיחות עם תמלול וניתוח AI",
    },
    {
      icon: FileText,
      title: "סיכומי טיפול",
      description: "עורך טקסט עשיר לסיכומים מקצועיים",
    },
    {
      icon: BarChart3,
      title: "דוחות וסטטיסטיקות",
      description: "מעקב אחר הכנסות ופעילות",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
      {/* Hero */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-2xl mb-8">
            <Leaf className="w-10 h-10 text-primary" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            טיפול
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            מערכת ניהול מודרנית ומאובטחת לפרקטיקה טיפולית.
            <br />
            נהלו מטופלים, פגישות ותשלומים במקום אחד.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/register">הרשמה עם קוד קופון</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">התחברות</Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* AI Feature Highlight */}
        <div className="mt-24 max-w-4xl mx-auto">
          <div className="p-8 rounded-3xl bg-gradient-to-br from-primary/5 to-accent/10 border">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mic className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-3">הקלטה וניתוח חכם</h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  הקליטו שיחות עם מטופלים ישירות מהמערכת. התמלול מבוצע אוטומטית 
                  עם Google AI Studio, והניתוח הטיפולי מבוצע עם Claude AI - 
                  זיהוי נושאים מרכזיים, סמנים רגשיים והמלצות לפגישה הבאה.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    תמלול אוטומטי בעברית
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    ניתוח רגשי וזיהוי נושאים
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    יצירת סיכומים אוטומטית
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    שמירה על פרטיות - הנתונים נשמרים רק אצלך
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-24 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 טיפול - מערכת ניהול לפרקטיקה טיפולית</p>
        </div>
      </footer>
    </div>
  );
}
