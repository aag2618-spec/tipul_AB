import Link from "next/link";
import { SECURITY_ITEMS } from "./landing-data";
import { Reveal } from "./reveal";

export function SecuritySection() {
  return (
    <section id="security" className="py-20 bg-gradient-to-b from-secondary/30 to-background">
      <div className="container mx-auto px-4 max-w-4xl">
        <Reveal className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">אבטחה ופרטיות ברמה הגבוהה ביותר</h2>
          <p className="text-muted-foreground text-lg">
            מידע טיפולי הוא מהרגיש שקיים. השקענו באבטחה מתקדמת כדי להגן עליכם ועל המטופלים שלכם.
          </p>
        </Reveal>
        <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
          {SECURITY_ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={(i % 4) * 70}>
              <div className="h-full text-center p-5 rounded-2xl bg-card border">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1.5">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="text-center mt-10">
          <p className="text-sm text-muted-foreground">
            מחויבים לעמידה בדרישות הגנת הפרטיות.{" "}
            <Link href="/legal/privacy" className="text-primary hover:underline">
              מדיניות הפרטיות
            </Link>
            {" · "}
            <Link href="/legal/dpa" className="text-primary hover:underline">
              הסכם עיבוד נתונים
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
