import { PRIVATE_FEATURES } from "./landing-data";
import { Reveal } from "./reveal";

// רשת הפיצ'רים שכל מטפל מקבל.
export function FeaturesGrid() {
  return (
    <section id="features" className="py-20">
      <div className="container mx-auto px-4">
        <Reveal className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">הכול מה שהפרקטיקה שלכם צריכה</h2>
          <p className="text-muted-foreground text-lg">
            מערכת שלמה לניהול כל ההיבטים של הפרקטיקה — מניהול מטופלים ועד תשלומים ודוחות
          </p>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
          {PRIVATE_FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="h-full p-6 rounded-2xl bg-card border shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
