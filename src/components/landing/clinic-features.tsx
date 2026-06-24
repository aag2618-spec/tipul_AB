import { Building2 } from "lucide-react";
import { CLINIC_FEATURES } from "./landing-data";
import { Reveal } from "./reveal";

// פיצ'רים נוספים שמקבלים בקליניקה / מרכז עם צוות.
export function ClinicFeatures() {
  return (
    <section id="clinic" className="py-20 bg-gradient-to-b from-background to-secondary/30">
      <div className="container mx-auto px-4">
        <Reveal className="landing-centered max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 text-sm font-medium bg-primary/10 text-primary rounded-full px-4 py-1.5 mb-4">
            <Building2 className="w-4 h-4" />
            לקליניקות ומרכזים טיפוליים
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">ניהול קליניקה שלמה עם צוות</h2>
          <p className="text-muted-foreground text-lg">
            כל מה שיש למטפל הפרטי — ובנוסף, כלים לניהול צוות, חדרים ובקרה ניהולית מלאה
          </p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
          {CLINIC_FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 70}>
              <div className="h-full p-5 rounded-2xl bg-card border shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1.5">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
